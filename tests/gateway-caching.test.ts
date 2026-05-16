/**
 * Multi-turn `ToolLoopAgent` cache-rate test for AI Gateway + Claude
 * Opus 4.7. Each test runs the SAME long conversation under a
 * different caching strategy and reports per-turn cache hit / write
 * counts so we can compare strategies side by side.
 *
 * Strategies (one test each):
 *   1. `instructions: <string>`, no caching opt-in
 *   2. `instructions: <string>`, `providerOptions.gateway.caching = 'auto'`
 *   3. `instructions: <SystemModelMessage>` with `cacheControl: ephemeral`
 *   4. #3 + gateway `caching: 'auto'`
 *   5. #3 + the last 3 history messages also tagged ephemeral (4
 *      breakpoints total — Anthropic's max).
 *
 * Each strategy gets its own fresh nonce so Anthropic's prompt cache
 * is COLD for that strategy's turn-1 call.
 *
 * Run: `bun --env-file=.env.local test lib/ai/gateway-caching/gateway-caching.test.ts`
 *
 * NOTE: `bun test` sets `NODE_ENV=test`, which causes Bun (matching
 * Next.js / CRA) to skip `.env.local`. Either pass
 * `--env-file=.env.local` explicitly, or put the gateway credential
 * in `.env.test.local` which IS loaded under NODE_ENV=test.
 *
 * Skips unless `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is set —
 * the calls are real and they cost money. Budget ~$2–4 for a full
 * run (5 strategies × 5 turns × Opus 4.7 prices).
 */

import { describe, expect, test } from "bun:test"
import {
  stepCountIs,
  ToolLoopAgent,
  type ModelMessage,
  type SystemModelMessage,
  type ToolSet,
} from "ai"
import {
  makeCountingPrepareStep,
  pinTailBreakpoint,
  withEphemeralCacheControl,
} from "../src/breakpoints"
import {
  formatGrandTotalRow,
  formatStepRow,
  formatTableHeader,
  formatTurnRow,
  type Pricing,
} from "../src/cache-stats"
import { runConversation, type ConversationStrategy } from "../src/conversation"
import { fetchPricing } from "../src/pricing"
import {
  conciseTools,
  testTools,
  type ConciseTools,
  type TestTools,
} from "../src/tools"
import { dropOldestToolUses } from "../src/trim"
import { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"

const MODEL = "anthropic/claude-opus-4.7"

// Pad the system to ~2.5k tokens so we're well above Anthropic's
// 1024-token cache-eligibility floor.
const LONG_KNOWLEDGE = Array.from(
  { length: 220 },
  (_, i) =>
    `Note ${i + 1}: This is a synthetic knowledge-base paragraph used purely to push the system prompt past the Anthropic prompt-cache minimum so the test can observe a real cache hit. The content is intentionally repetitive and content-free.`,
).join("\n\n")

function freshSystemPrompt(): string {
  const nonce = crypto.randomUUID()
  return [
    `[run-nonce ${nonce}]`,
    "You are a curt research assistant. Be brief — one or two short sentences per reply.",
    "You have three tools: `search_knowledge_base`, `fetch_document`, `list_recent_changes`. Use them aggressively — don't reason about knowledge-base contents without searching and fetching first.",
    "When the user asks you to research a topic, do at least one search and fetch the top 2 documents before answering.",
    "",
    "Below is a knowledge base for this run; ignore it unless the user explicitly references it.",
    "",
    LONG_KNOWLEDGE,
  ].join("\n")
}

// 5 turns × up to 12 steps each. Tool results are chunky (~1.5–3k
// tokens per call) so context grows quickly — exactly the shape
// where prompt-cache + context-editing decisions start to matter.
const USER_TURNS = [
  "Research 'cache invalidation patterns' — search the KB, fetch the top 3 hits, and give me a 2-sentence synthesis pulling from all three.",
  "Now do the same workflow for 'rate limiting': search, fetch the top 3, synthesize.",
  "And once more for 'distributed locks': search, fetch the top 3, synthesize.",
  "List the 5 most recent knowledge-base changes, then pick the one that's most relevant to the topics we've covered and fetch its full document.",
  "Recap the four topics we explored today, in one sentence each, citing one source per topic.",
] as const

// ---------------------------------------------------------------------------
// Strategy factories
// ---------------------------------------------------------------------------

// Up to 12 internal generations per turn so the tool loop has room
// to: 1 search → 3 fetches → 1 synthesis (≈5 steps) with headroom
// for the model to do extra refinement or backtracking.
const STOP_WHEN = stepCountIs(12)

/**
 * Reasonable defaults for Anthropic context management. Triggers
 * `clear_tool_uses` once input gets large, preserves the last 5
 * tool uses (most recent context), and falls back to whole-context
 * compaction if input keeps growing past 80k tokens. `clear_thinking`
 * is also enabled — it's a no-op unless extended thinking is on,
 * which we don't currently enable, but it costs nothing to include.
 */
/**
 * Extended thinking enabled on every strategy so the cache-rate
 * comparison is apples-to-apples — and because
 * `clear_thinking_20251015` errors out if thinking is disabled.
 *
 * Opus 4.7 doesn't accept `thinking.type: "enabled"` with an
 * explicit `budgetTokens`; that shape is for earlier Claude SKUs.
 * Instead, use `thinking.type: "adaptive"` paired with a separate
 * `effort` knob that controls how much reasoning to spend.
 */
const REASONING_OPTIONS: Pick<
  AnthropicLanguageModelOptions,
  "thinking" | "effort"
> = {
  thinking: { type: "adaptive" },
  effort: "medium",
}

const CONTEXT_MANAGEMENT: AnthropicLanguageModelOptions["contextManagement"] = {
  // Order matters: Anthropic requires `clear_thinking_20251015` to be
  // the FIRST strategy in `context_management.edits` when present.
  // (The gateway / API returns a 400 otherwise.)
  edits: [
    {
      type: "clear_thinking_20251015",
      keep: { type: "thinking_turns", value: 2 },
    },
    {
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 30_000 },
      keep: { type: "tool_uses", value: 5 },
      clearAtLeast: { type: "input_tokens", value: 5_000 },
      clearToolInputs: false,
    },
    {
      type: "compact_20260112",
      trigger: { type: "input_tokens", value: 80_000 },
      instructions:
        "Summarize the conversation concisely, preserving the topics researched, key facts cited, and any tool-result URLs the user might reference later.",
      pauseAfterCompaction: false,
    },
  ],
}

function stratStringNoOptIn(systemPrompt: string): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: false })
  return {
    label: "1. instructions: STRING, no opt-in",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: systemPrompt,
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}

function stratStringGatewayAuto(systemPrompt: string): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: false })
  return {
    label: "2. instructions: STRING, gateway caching:'auto'",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: systemPrompt,
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: { ...REASONING_OPTIONS },
      },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}

function stratStringGatewayAutoPlusPrepareStep(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: false,
  })
  return {
    label: "2b. instructions: STRING, gateway caching:'auto' + prepareStep",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: systemPrompt,
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: { ...REASONING_OPTIONS },
      },
    }),
    lastBreakpointCount: counter.lastCount,
  }
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

function stratSystemMessageEphemeral(systemPrompt: string): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })
  return {
    label: "3. instructions: SystemModelMessage + manual ephemeral",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}

function stratSystemMessageEphemeralPlusGatewayAuto(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })
  return {
    label: "4. SystemModelMessage ephemeral + gateway caching:'auto'",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: { ...REASONING_OPTIONS },
      },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}

function stratSevenAllTechniques(
  systemPrompt: string,
): ConversationStrategy<ConciseTools> {
  // Track how many tool uses the server has cleared so far across
  // the whole conversation — we use this to mirror its trim on our
  // outgoing prefix next turn so the cached prefix on the server
  // matches what we're sending.
  let serverClearedToolUses = 0
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: true,
  })

  return {
    label:
      "7. all techniques: concise tools + per-step breakpoint + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: conciseTools,
      stopWhen: STOP_WHEN,
      // Pin an ephemeral breakpoint on the LAST message before
      // every internal tool-loop step — caches the within-turn
      // tool tail step-by-step.
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: {
          ...REASONING_OPTIONS,
          contextManagement: CONTEXT_MANAGEMENT,
        } satisfies AnthropicLanguageModelOptions,
      },
    }),
    lastBreakpointCount: counter.lastCount,
    // Before each turn: pin breakpoints on the LAST 3 history
    // messages so the 4-breakpoint window (system + 3 trailing) keeps
    // the rolling-cache prefix anchored within the 20-block lookback.
    transform: (history) =>
      history.map((m, i) => {
        const fromEnd = history.length - 1 - i
        return fromEnd < 3 ? withEphemeralCacheControl(m) : m
      }),
    // After each turn: see how many tool uses the server cleared,
    // mirror the trim locally so next turn's outgoing prefix matches
    // what the server already wrote to cache.
    afterTurn: (history, turn) => {
      let newlyCleared = 0
      for (const step of turn.steps) {
        for (const edit of step.appliedEdits) {
          const m = edit.match(/cleared (\d+) tool use/)
          if (m) newlyCleared += Number(m[1])
        }
      }
      if (newlyCleared === 0) return history
      serverClearedToolUses += newlyCleared
      return dropOldestToolUses(history, newlyCleared)
    },
  }
}

function stratEightVerboseAllTechniques(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  // Same shape as strategy 7 but with the VERBOSE toolkit, so we can
  // isolate the value of the concise-tools choice from everything
  // else in strategy 7 (per-step breakpoint + breakpoint chain +
  // gateway auto + context management + mirror-trim).
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: true,
  })
  return {
    label:
      "8. verbose tools + per-step breakpoint + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: {
          ...REASONING_OPTIONS,
          contextManagement: CONTEXT_MANAGEMENT,
        } satisfies AnthropicLanguageModelOptions,
      },
    }),
    lastBreakpointCount: counter.lastCount,
    transform: (history) =>
      history.map((m, i) => {
        const fromEnd = history.length - 1 - i
        return fromEnd < 3 ? withEphemeralCacheControl(m) : m
      }),
    afterTurn: (history, turn) => {
      let newlyCleared = 0
      for (const step of turn.steps) {
        for (const edit of step.appliedEdits) {
          const m = edit.match(/cleared (\d+) tool use/)
          if (m) newlyCleared += Number(m[1])
        }
      }
      if (newlyCleared === 0) return history
      return dropOldestToolUses(history, newlyCleared)
    },
  }
}

function stratGatewayAutoWithContextManagement(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })
  return {
    label: "6. gateway caching:'auto' + context management defaults",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: {
          ...REASONING_OPTIONS,
          contextManagement: CONTEXT_MANAGEMENT,
        } satisfies AnthropicLanguageModelOptions,
      },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}

function stratFourBreakpoints(systemPrompt: string): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })
  return {
    label: "5. SystemModelMessage ephemeral + ephemeral on last 3 history msgs",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,
    // Tag the last 3 history messages with cache_control: ephemeral
    // (in addition to the system message → 4 breakpoints total,
    // exactly at Anthropic's max).
    transform: (history) => {
      const out: ModelMessage[] = history.map((m, i) => {
        const fromEnd = history.length - 1 - i
        return fromEnd < 3 ? withEphemeralCacheControl(m) : m
      })
      return out
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const hasGatewayCreds = !!(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
)

/**
 * Lazy pricing fetcher — populated on the first test that needs it
 * and reused across the rest of the suite (one HTTP call per `bun
 * test` run, not per strategy).
 */
let _pricingCache: Pricing | undefined
async function pricing(): Promise<Pricing> {
  if (!_pricingCache) _pricingCache = await fetchPricing(MODEL)
  return _pricingCache
}

/**
 * Run one strategy end-to-end. Renders ONE growing table to the
 * console: header at the top, one row per step as it finishes,
 * a `T<n>` aggregate row after each turn, and a final `TOT` line.
 * Each row includes a USD cost column priced via AI Gateway's
 * published per-token rates.
 */
async function runStrategy<TOOLS extends ToolSet>(
  factory: (systemPrompt: string) => ConversationStrategy<TOOLS>,
) {
  const p = await pricing()
  const systemPrompt = freshSystemPrompt()
  const strategy = factory(systemPrompt)
  console.log(`\n=== ${strategy.label} ===`)
  console.log(formatTableHeader(p))
  const result = await runConversation({
    strategy,
    userTurns: USER_TURNS,
    onStep: (s) => {
      console.log(formatStepRow(s, p))
      for (const edit of s.appliedEdits) {
        console.log(`      ↪ ${edit}`)
      }
    },
    onTurn: (t) => {
      console.log(formatTurnRow(t, p))
    },
    onWarn: (turn, warnings) =>
      console.log(`  turn ${turn} warnings:`, JSON.stringify(warnings)),
  })
  console.log(formatGrandTotalRow(result.stats, p))
  return result
}

describe("AI Gateway caching: multi-turn ToolLoopAgent with Opus 4.7", () => {
  test.skipIf(!hasGatewayCreds)(
    "strategy 1: instructions string, no opt-in",
    async () => {
      const result = await runStrategy(stratStringNoOptIn)
      for (const t of result.stats.turns) {
        expect(t.total.cacheReadTokens).toBe(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 2: instructions string, gateway caching:'auto'",
    async () => {
      const result = await runStrategy(stratStringGatewayAuto)
      const turns = result.stats.turns
      // Turn 1's first step is cold; subsequent steps within the
      // same turn should hit the cache once it's been written.
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 2b: gateway caching:'auto' + prepareStep ONLY (no other changes vs #2)",
    async () => {
      const result = await runStrategy(stratStringGatewayAutoPlusPrepareStep)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 3: instructions: SystemModelMessage + manual ephemeral",
    async () => {
      const result = await runStrategy(stratSystemMessageEphemeral)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 4: SystemModelMessage ephemeral + gateway caching:'auto'",
    async () => {
      const result = await runStrategy(stratSystemMessageEphemeralPlusGatewayAuto)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 5: system + last 3 history msgs ephemeral (4 breakpoints)",
    async () => {
      const result = await runStrategy(stratFourBreakpoints)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 6: gateway caching:'auto' + context management defaults",
    async () => {
      const result = await runStrategy(stratGatewayAutoWithContextManagement)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      // Subsequent turns should still cache, even though context
      // edits may invalidate the cache prefix when they fire.
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
      // Print which edits actually fired across the conversation —
      // helps confirm the defaults are reasonable for this load.
      const allEdits = turns.flatMap((t) =>
        t.steps.flatMap((s) => s.appliedEdits.map((e) => `T${t.turn} S${s.step}: ${e}`)),
      )
      console.log(
        `\nContext edits applied across conversation: ${allEdits.length}`,
      )
      for (const e of allEdits) console.log(`  ${e}`)
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 8: verbose tools + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    async () => {
      const result = await runStrategy(stratEightVerboseAllTechniques)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
      const allEdits = turns.flatMap((t) =>
        t.steps.flatMap((s) =>
          s.appliedEdits.map((e) => `T${t.turn} S${s.step}: ${e}`),
        ),
      )
      console.log(
        `\nContext edits applied across conversation: ${allEdits.length}`,
      )
      for (const e of allEdits) console.log(`  ${e}`)
      console.log(
        `\nOverall hit rate: ${Math.round(result.stats.total.hitRate * 100)}%`,
      )
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 7: concise tools + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    async () => {
      const result = await runStrategy(stratSevenAllTechniques)
      const turns = result.stats.turns
      expect(turns[0]!.steps[0]!.cacheReadTokens).toBe(0)
      for (let i = 1; i < turns.length; i++) {
        expect(turns[i]!.total.cacheReadTokens).toBeGreaterThan(0)
      }
      const allEdits = turns.flatMap((t) =>
        t.steps.flatMap((s) =>
          s.appliedEdits.map((e) => `T${t.turn} S${s.step}: ${e}`),
        ),
      )
      console.log(
        `\nContext edits applied across conversation: ${allEdits.length}`,
      )
      for (const e of allEdits) console.log(`  ${e}`)
      // The goal of strategy 7 is to land above 90% overall.
      console.log(
        `\nOverall hit rate: ${Math.round(result.stats.total.hitRate * 100)}%`,
      )
    },
    { timeout: 600_000 },
  )
})
