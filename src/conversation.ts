/**
 * Multi-turn conversation runner for the gateway-caching tests.
 *
 * Drives a fixed sequence of user prompts through one
 * `ToolLoopAgent`. For each turn:
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

export interface ConversationStrategy<TOOLS extends ToolSet> {
  label: string
  agent: ToolLoopAgent<never, TOOLS>
  /** Optional history transform applied right before each turn. */
  transform?: (history: readonly ModelMessage[]) => ModelMessage[]
  /**
   * Optional hook fired after each turn finishes. See afterTurn doc.
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

  for (let i = 0; i < userTurns.length; i++) {
    const turn = i + 1
    const userText = userTurns[i]!
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

/**
 * Pull a one-line description out of each Anthropic context-edit
 * record. Shapes are documented in the Anthropic provider's
 * `contextManagement` block — we soft-decode rather than import the
 * Zod-inferred type, since the field names change per edit type.
 */
function extractAppliedEdits(
  providerMetadata: unknown,
): string[] {
  const cm = (providerMetadata as
    | {
        anthropic?: {
          contextManagement?: { appliedEdits?: unknown[] }
        }
      }
    | undefined)?.anthropic?.contextManagement

  if (!cm?.appliedEdits || cm.appliedEdits.length === 0) {
    return []
  }

  return cm.appliedEdits.map((raw): string => {
    const e = raw as {
      type?: string
      clearedToolUses?: number
      clearedThinkingTurns?: number
      clearedInputTokens?: number
    }

    switch (e.type) {
      case "clear_tool_uses_20250919":
        return `cleared ${e.clearedToolUses ?? "?"} tool use(s); freed ${e.clearedInputTokens ?? "?"} tokens`

      case "clear_thinking_20251015":
        return `cleared ${e.clearedThinkingTurns ?? "?"} thinking turn(s); freed ${e.clearedInputTokens ?? "?"} tokens`

      case "compact_20260112":
        return "compaction applied"

      default:
        return `edit applied: ${e.type ?? "<unknown>"}`
    }
  })
}
