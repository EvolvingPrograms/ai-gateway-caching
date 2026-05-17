/**
 * Multi-turn conversation runner for the gateway-caching tests.
 *
 * Drives a fixed sequence of user prompts through one `ToolLoopAgent`.
 * For each turn:
 *
 *   1. Optionally transforms the running history (strategy hook).
 *   2. Calls `agent.generate({ messages, onStepFinish })`. The
 *      ToolLoop runs entirely inside that call; we capture each
 *      internal step's usage AND any context-edits Anthropic
 *      applied (clear_tool_uses / clear_thinking / compact) via
 *      `event.providerMetadata.anthropic.contextManagement`.
 *   3. Appends the new user turn + the response's recorded messages
 *      to the running history.
 */

import type { AnthropicMessageMetadata } from "@ai-sdk/anthropic"
import type {
  ModelMessage,
  StepResult,
  ToolLoopAgent,
  ToolSet,
} from "ai"

import {
  aggregateRows,
  rowFromUsage,
  summarizeTurns,
  type ConversationCacheStats,
  type StepRow,
  type TurnRecord,
} from "./stats"


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationStrategy<TOOLS extends ToolSet> {
  label: string
  agent: ToolLoopAgent<never, TOOLS>

  /** Optional history transform applied right before each turn. */
  transform?: (history: readonly ModelMessage[]) => ModelMessage[]

  /**
   * Optional hook fired after each turn finishes. See `afterTurn` doc.
   */
  afterTurn?: (
    history: ModelMessage[],
    turn: TurnRecord,
  ) => ModelMessage[]

  /**
   * Optional accessor for the number of cache_control breakpoints
   * the strategy installed in the most-recent internal step. The
   * runner reads this immediately after `onStepFinish` and writes
   * it onto the step row. Strategies typically build this via
   * `makeCountingPrepareStep(...)` from `./breakpoints`.
   */
  lastBreakpointCount?: () => number
}


export interface RunResult {
  stats: ConversationCacheStats
  finalHistory: ModelMessage[]
}


// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runConversation<TOOLS extends ToolSet>(args: {
  strategy: ConversationStrategy<TOOLS>
  userTurns: readonly string[]
  onWarn?: (turn: number, warnings: readonly unknown[]) => void
  onStep?: (step: StepRow) => void
  onTurn?: (turn: TurnRecord) => void
}): Promise<RunResult> {
  const { strategy, userTurns, onWarn, onStep, onTurn } = args
  const history: ModelMessage[] = []
  const turns: TurnRecord[] = []

  for (const [i, userText] of userTurns.entries()) {
    const turn = i + 1
    const steps: StepRow[] = []

    const transformed = strategy.transform
      ? strategy.transform(history)
      : [...history]

    let stepStartMs = Date.now()
    const result = await strategy.agent.generate({
      messages: [...transformed, { role: "user", content: userText }],
      onStepFinish: (event: StepResult<TOOLS>) => {
        const now = Date.now()
        const seconds = (now - stepStartMs) / 1000
        stepStartMs = now

        const step: StepRow = {
          turn,
          step: event.stepNumber + 1,
          ...rowFromUsage(event.usage, seconds),
          breakpoints: strategy.lastBreakpointCount?.() ?? 0,
          appliedEdits: extractAppliedEdits(event.providerMetadata),
        }

        steps.push(step)
        onStep?.(step)
      },
    })

    const turnRecord: TurnRecord = {
      turn,
      steps,
      total: aggregateRows(steps),
    }

    turns.push(turnRecord)
    onTurn?.(turnRecord)

    history.push({ role: "user", content: userText })
    history.push(...result.response.messages)

    if (strategy.afterTurn) {
      const next = strategy.afterTurn(history, turnRecord)
      history.length = 0
      history.push(...next)
    }

    if (onWarn && result.warnings && result.warnings.length > 0) {
      onWarn(turn, result.warnings)
    }
  }

  return { stats: summarizeTurns(turns), finalHistory: history }
}


// ---------------------------------------------------------------------------
// Context-edit decoding
// ---------------------------------------------------------------------------

type AppliedEdit = NonNullable<
  AnthropicMessageMetadata["contextManagement"]
>["appliedEdits"][number]


/**
 * Pull a one-line description out of each Anthropic context-edit
 * record on a step's `providerMetadata`. The Anthropic provider
 * publishes the strongly-typed shape under `AnthropicMessageMetadata`;
 * we read it via a small typed predicate so the dispatch below
 * gets full union narrowing per edit type.
 *
 * Exported for `conversation.test.ts` — not part of the public
 * runner surface.
 */
export function extractAppliedEdits(providerMetadata: unknown): string[] {
  const meta = readAnthropicMetadata(providerMetadata)
  const edits = meta?.contextManagement?.appliedEdits
  if (!edits || edits.length === 0) return []

  return edits.map(describeEdit)
}


function describeEdit(edit: AppliedEdit): string {
  switch (edit.type) {
    case "clear_tool_uses_20250919":
      return `cleared ${edit.clearedToolUses} tool use(s); freed ${edit.clearedInputTokens} tokens`

    case "clear_thinking_20251015":
      return `cleared ${edit.clearedThinkingTurns} thinking turn(s); freed ${edit.clearedInputTokens} tokens`

    case "compact_20260112":
      return "compaction applied"

    default:
      // Unknown edit type — fall back to a generic line. The
      // `never` widening below documents that any future edit-type
      // additions in @ai-sdk/anthropic will surface here at compile
      // time.
      const unknown: { type: string } = edit
      return `edit applied: ${unknown.type}`
  }
}


/**
 * Read the `anthropic` block of an AI SDK step's `providerMetadata`,
 * typed as `AnthropicMessageMetadata`. The SDK stores
 * `providerMetadata` as `Record<string, Record<string, JSONValue>>`,
 * so the trust boundary lives here — one cast, well-named, at the
 * point where untyped provider data becomes typed model data.
 */
function readAnthropicMetadata(
  providerMetadata: unknown,
): AnthropicMessageMetadata | undefined {
  if (providerMetadata === null || typeof providerMetadata !== "object") {
    return undefined
  }
  if (!("anthropic" in providerMetadata)) return undefined

  const { anthropic } = providerMetadata
  if (anthropic === null || typeof anthropic !== "object") return undefined

  return anthropic as AnthropicMessageMetadata
}
