/**
 * Focused experiment: does pinning an ephemeral cache_control
 * breakpoint on the LAST message before every internal tool-loop
 * step actually cache the within-turn tool tail?
 *
 * Baseline (no per-step breakpoint): we expect each subsequent step
 * inside one `agent.generate()` call to see the previous step's
 * tool-call + tool-result as uncached tail.
 *
 * Treatment (per-step breakpoint via `prepareStep`): we expect
 * each step to read the previous step's write — the new chunk gets
 * cached at the end of step N, then step N+1 reads it before
 * generating the next.
 *
 * One turn, one user prompt, ~4 internal steps. Same tools, same
 * system prompt (modulo a fresh nonce per case so the cache starts
 * cold for each run). Outputs the per-step cache table for both.
 *
 * Run: `bun --env-file=.env.local test lib/ai/gateway-caching/per-step-breakpoint.test.ts`
 */

import { describe, expect, test } from "bun:test"
import {
  ToolLoopAgent,
  stepCountIs,
  type LanguageModelUsage,
  type ModelMessage,
  type SystemModelMessage,
} from "ai"
import { withEphemeralCacheControl } from "../src/breakpoints"
import {
  formatCacheTable,
  rowFromUsage,
  summarizeTurns,
  type StepRow,
  type TurnRecord,
} from "../src/cache-stats"
import { fetchPricing } from "../src/pricing"
import { verboseTools, type VerboseTools } from "../src/tools"

const MODEL = "anthropic/claude-opus-4.7"

function freshSystemPrompt(): string {
  const nonce = crypto.randomUUID()
  const LONG_KNOWLEDGE = Array.from(
    { length: 220 },
    (_, i) =>
      `Note ${i + 1}: padding paragraph to push the system prompt above the 1024-token cache floor. Synthetic content, no meaning.`,
  ).join("\n\n")
  return [
    `[run-nonce ${nonce}]`,
    "You are a curt research assistant. Use tools aggressively — search and fetch before answering.",
    "",
    LONG_KNOWLEDGE,
  ].join("\n")
}

function ephemeralSystem(systemPrompt: string): SystemModelMessage {
  return {
    role: "system",
    content: systemPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  }
}

// A prompt that forces several search + fetch steps in one turn.
const USER_PROMPT =
  "Research 'cache invalidation', 'rate limiting', AND 'distributed locks'. For each, do one `search_knowledge_base` and one `fetch_document` on the top hit. Then give me a one-sentence synthesis."

const STOP_WHEN = stepCountIs(10)

const REASONING_OPTIONS = {
  thinking: { type: "adaptive" as const },
  effort: "medium" as const,
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

interface RunOutcome {
  label: string
  stats: ReturnType<typeof summarizeTurns>
}

/**
 * Run one turn with an agent built from the given prepareStep hook.
 * Reports per-step cache stats and the conversation summary.
 */
async function runOneTurn(
  label: string,
  prepareStep:
    | ((opts: {
        stepNumber: number
        messages: ModelMessage[]
      }) => { messages?: ModelMessage[] } | undefined)
    | undefined,
): Promise<RunOutcome> {
  const systemPrompt = freshSystemPrompt()
  const agent = new ToolLoopAgent<never, VerboseTools>({
    model: MODEL,
    instructions: ephemeralSystem(systemPrompt),
    tools: verboseTools,
    stopWhen: STOP_WHEN,
    providerOptions: { anthropic: REASONING_OPTIONS },
    // `prepareStep` runs before each internal generation; we use it
    // to override `messages` with a copy whose tail has an ephemeral
    // breakpoint.
    prepareStep,
  })

  const steps: StepRow[] = []
  console.log(`\n--- ${label} ---`)
  await agent.generate({
    messages: [{ role: "user", content: USER_PROMPT }],
    onStepFinish: ({
      stepNumber,
      usage,
    }: {
      stepNumber: number
      usage: LanguageModelUsage
    }) => {
      const row: StepRow = {
        turn: 1,
        step: stepNumber + 1,
        ...rowFromUsage(usage),
        breakpoints: 0,
        appliedEdits: [],
      }
      steps.push(row)
      const pct = Math.round(row.hitRate * 100)
      console.log(
        `  step ${row.step}: input=${row.inputTokens} read=${row.cacheReadTokens} write=${row.cacheWriteTokens} noCache=${row.noCacheTokens} output=${row.outputTokens} hit=${pct}%`,
      )
    },
  })

  const turn: TurnRecord = {
    turn: 1,
    steps,
    total: {
      inputTokens: steps.reduce((a, s) => a + s.inputTokens, 0),
      noCacheTokens: steps.reduce((a, s) => a + s.noCacheTokens, 0),
      cacheReadTokens: steps.reduce((a, s) => a + s.cacheReadTokens, 0),
      cacheWriteTokens: steps.reduce((a, s) => a + s.cacheWriteTokens, 0),
      outputTokens: steps.reduce((a, s) => a + s.outputTokens, 0),
      hitRate: 0,
        seconds: 0,
    },
  }
  turn.total.hitRate =
    turn.total.inputTokens > 0
      ? turn.total.cacheReadTokens / turn.total.inputTokens
      : 0

  const stats = summarizeTurns([turn])
  const p = await fetchPricing(MODEL).catch(() => undefined)
  console.log("\n" + formatCacheTable(label, stats, p))
  return { label, stats }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const hasGatewayCreds = !!(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
)

describe("Per-step breakpoint placement", () => {
  test.skipIf(!hasGatewayCreds)(
    "BASELINE: no per-step breakpoint — only system is cached, tool tail is uncached each step",
    async () => {
      const outcome = await runOneTurn("baseline (no prepareStep)", undefined)
      // Step 1 should be cold-ish (just system reads if anything).
      expect(outcome.stats.turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
    },
    { timeout: 300_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "TREATMENT: pin ephemeral on the LAST message before each step — within-turn tail caches step-to-step",
    async () => {
      const outcome = await runOneTurn(
        "treatment (prepareStep pins last-msg breakpoint)",
        ({ messages }) => {
          if (messages.length === 0) return undefined
          const lastIdx = messages.length - 1
          const tagged = messages.slice()
          tagged[lastIdx] = withEphemeralCacheControl(tagged[lastIdx]!)
          return { messages: tagged }
        },
      )
      // Step 1 still cold, but later steps in the same turn should
      // read what the previous step wrote.
      expect(outcome.stats.turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      const laterSteps = outcome.stats.turns[0]!.steps.slice(1)
      // Each subsequent step's read should grow as the previous
      // step's write becomes available.
      for (let i = 1; i < laterSteps.length; i++) {
        expect(
          laterSteps[i]!.cacheReadTokens,
        ).toBeGreaterThanOrEqual(laterSteps[i - 1]!.cacheReadTokens)
      }
    },
    { timeout: 300_000 },
  )
})
