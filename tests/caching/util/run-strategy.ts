/**
 * Single-strategy harness. Runs one strategy factory through the
 * shared `USER_TURNS` conversation, streams a fixed-width per-step
 * table (with dollarized cost) to the console, and returns the
 * structured stats for assertions.
 *
 * The `Pricing` lookup is cached at module scope so the gateway
 * model-catalogue HTTP call happens once per test process, not once
 * per strategy.
 */

import type { ToolSet } from "ai"

import { runConversation, type ConversationStrategy } from "../../../src/conversation"
import { fetchPricing } from "../../../src/pricing"
import {
  formatGrandTotalRow,
  formatStepRow,
  formatTableHeader,
  formatTurnRow,
  type Pricing,
} from "../../../src/stats"

import { MODEL, USER_TURNS, freshSystemPrompt } from "./fixture"


// ---------------------------------------------------------------------------
// Pricing cache
// ---------------------------------------------------------------------------

let pricingCache: Pricing | undefined


async function pricing(): Promise<Pricing> {
  if (!pricingCache) pricingCache = await fetchPricing(MODEL)
  return pricingCache
}


// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export async function runStrategy<TOOLS extends ToolSet>(
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
