/**
 * Aggregation primitives over `CacheRow` / `TurnRecord`.
 *
 *   - `rowFromUsage` — build a CacheRow from an AI SDK `LanguageModelUsage`.
 *   - `aggregateRows` — sum rows, recomputing hitRate from the totals.
 *   - `summarizeTurns` — fold turn totals into a conversation grand-total.
 *   - `rowCost` — dollarize a row using gateway-published pricing.
 *
 * Pure functions only; no I/O.
 */

import type { LanguageModelUsage } from "ai"

import type {
  CacheRow,
  ConversationCacheStats,
  Pricing,
  TurnRecord,
} from "./types"


// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * Compute total USD cost for a single cache row given a pricing
 * table. Sums uncached input + cache-read input + cache-write input
 * + output at their respective per-token rates.
 */
export function rowCost(row: CacheRow, pricing: Pricing): number {
  return (
    row.noCacheTokens * pricing.inputRate +
    row.cacheReadTokens * pricing.cacheReadRate +
    row.cacheWriteTokens * pricing.cacheWriteRate +
    row.outputTokens * pricing.outputRate
  )
}


// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

/**
 * Build a `CacheRow` from an AI SDK usage object. All fields are
 * coerced to numbers (the SDK exposes them as `number | undefined`).
 */
export function rowFromUsage(
  usage: LanguageModelUsage,
  seconds = 0,
): CacheRow {
  const inputTokens = usage.inputTokens ?? 0
  const noCacheTokens = usage.inputTokenDetails.noCacheTokens ?? 0
  const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens ?? 0
  const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0

  return {
    inputTokens,
    noCacheTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    hitRate: inputTokens > 0 ? cacheReadTokens / inputTokens : 0,
    seconds,
  }
}


// ---------------------------------------------------------------------------
// Folds
// ---------------------------------------------------------------------------

/** Sum a list of rows. Empty list returns an all-zeroes row. */
export function aggregateRows(rows: readonly CacheRow[]): CacheRow {
  const acc: CacheRow = {
    inputTokens: 0,
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    hitRate: 0,
    seconds: 0,
  }

  for (const r of rows) {
    acc.inputTokens += r.inputTokens
    acc.noCacheTokens += r.noCacheTokens
    acc.cacheReadTokens += r.cacheReadTokens
    acc.cacheWriteTokens += r.cacheWriteTokens
    acc.outputTokens += r.outputTokens
    acc.seconds += r.seconds
  }

  acc.hitRate = acc.inputTokens > 0 ? acc.cacheReadTokens / acc.inputTokens : 0
  return acc
}


export function summarizeTurns(turns: TurnRecord[]): ConversationCacheStats {
  return { turns, total: aggregateRows(turns.map((t) => t.total)) }
}
