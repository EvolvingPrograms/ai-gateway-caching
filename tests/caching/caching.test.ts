/**
 * Multi-turn `ToolLoopAgent` cache-rate test for AI Gateway + Claude
 * Opus 4.7. Each test runs the SAME long conversation (`USER_TURNS`)
 * under a different caching strategy and reports per-turn cache hit
 * / write counts so we can compare strategies side by side.
 *
 * Strategies live in `./strategies/`; shared helpers in `./util/`.
 * This file is intentionally a thin manifest of `test(...)` calls —
 * each test imports one strategy factory, runs it, and asserts the
 * cross-strategy contract (turn 1 is cold; subsequent turns hit the
 * cache).
 *
 * Run: `bun --env-file=.env.local test tests/caching/caching.test.ts`
 *
 * NOTE: `bun test` sets `NODE_ENV=test`, which causes Bun (matching
 * Next.js / CRA) to skip `.env.local`. Either pass
 * `--env-file=.env.local` explicitly, or put the gateway credential
 * in `.env.test.local` which IS loaded under NODE_ENV=test.
 *
 * Skips unless `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is set —
 * the calls are real and they cost money. Budget ~$2–4 for a full
 * run (10 strategies × 20 turns × Opus 4.7 prices).
 */

import { describe, expect, test } from "bun:test"
import type { ToolSet } from "ai"

import type { ConversationStrategy, RunResult } from "@/src/conversation"

import {
  stratEightVerboseAllTechniques,
  stratFourBreakpoints,
  stratGatewayAutoWithContextManagement,
  stratNineManualBreakpoints,
  stratSevenAllTechniques,
  stratStringGatewayAuto,
  stratStringGatewayAutoPlusPrepareStep,
  stratStringNoOptIn,
  stratSystemMessageEphemeral,
  stratSystemMessageEphemeralPlusGatewayAuto,
} from "./strategies"

import { runStrategy } from "./util"

const hasGatewayCreds = !!(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
)

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/** Turn 1's first step is COLD; every subsequent turn must read cache. */
function expectStandardCacheProgression<TOOLS extends ToolSet>(
  result: RunResult,
  _strategy: ConversationStrategy<TOOLS>,
): void {
  const turns = result.stats.turns

  const firstTurn = turns[0]
  const firstStep = firstTurn?.steps[0]
  expect(firstStep?.cacheReadTokens).toBe(0)

  for (let i = 1; i < turns.length; i++) {
    const turn = turns[i]
    if (!turn) {
      continue
    }
    expect(turn.total.cacheReadTokens).toBeGreaterThan(0)
  }
}

/** Print every context-edit fired during the run, in T<x> S<y> order. */
function logAppliedEdits(result: RunResult): void {
  const allEdits = result.stats.turns.flatMap((t) =>
    t.steps.flatMap((s) =>
      s.appliedEdits.map((e) => `T${t.turn} S${s.step}: ${e}`),
    ),
  )
  console.log(
    `\nContext edits applied across conversation: ${allEdits.length}`,
  )
  for (const e of allEdits) console.log(`  ${e}`)
}

function logHitRate(result: RunResult): void {
  console.log(
    `\nOverall hit rate: ${Math.round(result.stats.total.hitRate * 100)}%`,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AI Gateway caching: multi-turn ToolLoopAgent with Opus 4.7", () => {
  test.skipIf(!hasGatewayCreds)(
    "strategy 1: instructions string, no opt-in",
    async () => {
      const result = await runStrategy(stratStringNoOptIn)

      // Baseline: NO cache reads on any turn.
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
      expectStandardCacheProgression(result, stratStringGatewayAuto(""))
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 2b: gateway caching:'auto' + prepareStep ONLY (no other changes vs #2)",
    async () => {
      const result = await runStrategy(stratStringGatewayAutoPlusPrepareStep)
      expectStandardCacheProgression(
        result,
        stratStringGatewayAutoPlusPrepareStep(""),
      )
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 3: instructions: SystemModelMessage + manual ephemeral",
    async () => {
      const result = await runStrategy(stratSystemMessageEphemeral)
      expectStandardCacheProgression(result, stratSystemMessageEphemeral(""))
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 4: SystemModelMessage ephemeral + gateway caching:'auto'",
    async () => {
      const result = await runStrategy(stratSystemMessageEphemeralPlusGatewayAuto)
      expectStandardCacheProgression(
        result,
        stratSystemMessageEphemeralPlusGatewayAuto(""),
      )
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 5: system + last 3 history msgs ephemeral (4 breakpoints)",
    async () => {
      const result = await runStrategy(stratFourBreakpoints)
      expectStandardCacheProgression(result, stratFourBreakpoints(""))
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 6: gateway caching:'auto' + context management defaults",
    async () => {
      const result = await runStrategy(stratGatewayAutoWithContextManagement)
      expectStandardCacheProgression(
        result,
        stratGatewayAutoWithContextManagement(""),
      )
      logAppliedEdits(result)
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 7: concise tools + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    async () => {
      const result = await runStrategy(stratSevenAllTechniques)
      expectStandardCacheProgression(result, stratSevenAllTechniques(""))
      logAppliedEdits(result)
      logHitRate(result)
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 8: verbose tools + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    async () => {
      const result = await runStrategy(stratEightVerboseAllTechniques)
      expectStandardCacheProgression(result, stratEightVerboseAllTechniques(""))
      logAppliedEdits(result)
      logHitRate(result)
    },
    { timeout: 600_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "strategy 9: verbose tools + manual 4-bp budget + context mgmt + mirror-trim, NO gateway auto",
    async () => {
      const result = await runStrategy(stratNineManualBreakpoints)
      expectStandardCacheProgression(result, stratNineManualBreakpoints(""))
      logAppliedEdits(result)
      logHitRate(result)
    },
    { timeout: 600_000 },
  )
})
