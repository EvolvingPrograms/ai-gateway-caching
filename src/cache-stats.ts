/**
 * Cache-rate accounting for generateText / streamText / ToolLoopAgent
 * calls.
 *
 * The AI SDK normalizes provider-specific cache reporting into
 * `LanguageModelUsage.inputTokenDetails`. We re-shape it into a
 * flat record + summarize at the step / turn / conversation level.
 *
 * Hierarchy:
 *   - `CacheRow`        — one model generation (one step OR one
 *                          aggregated turn). Same shape either way.
 *   - `TurnRecord`      — a turn = N steps + an aggregate row.
 *   - `ConversationCacheStats` — turns[] + grand total.
 *
 * Field meanings (Anthropic-style accounting, normalized by the SDK):
 *   - `inputTokens`      — total billable input.
 *   - `noCacheTokens`    — input charged at the standard rate.
 *   - `cacheReadTokens`  — input served from prompt cache.
 *   - `cacheWriteTokens` — input written to prompt cache this call.
 *   - `outputTokens`     — model output.
 *   - `hitRate`          — `cacheReadTokens / inputTokens` in [0, 1].
 */

import type { LanguageModelUsage } from "ai"

export interface CacheRow {
  inputTokens: number
  noCacheTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  hitRate: number
  /** Wall-clock seconds for the call(s) this row represents. */
  seconds: number
}

export interface StepRow extends CacheRow {
  turn: number
  step: number
  /**
   * Number of cache_control breakpoints WE set on this step's
   * outgoing prefix (system if it had ephemeral + per-part markers
   * in messages). Does NOT count gateway's auto-added breakpoint —
   * that's added server-side and invisible from our request.
   */
  breakpoints: number
  /**
   * One-line summaries of any context-editing operations Anthropic
   * applied to this step's prompt (e.g. "cleared 3 tool uses; freed
   * 4500 tokens", "compaction applied"). Empty array if no edits.
   */
  appliedEdits: string[]
}

export interface TurnRecord {
  turn: number
  steps: StepRow[]
  total: CacheRow
}

export interface ConversationCacheStats {
  turns: TurnRecord[]
  total: CacheRow
}

/**
 * Per-token USD pricing for a model, mirrors the shape AI Gateway
 * publishes via `gateway.getAvailableModels()`.
 */
export interface Pricing {
  /** USD per uncached input token (the standard input rate). */
  inputRate: number
  /** USD per output token. */
  outputRate: number
  /** USD per cache-read input token (Anthropic's 0.1× rate). */
  cacheReadRate: number
  /** USD per cache-creation/write input token (Anthropic's 1.25× rate). */
  cacheWriteRate: number
}

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

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const BASE_HEADER = [
  "turn",
  "step",
  "bp",
  "input",
  "noCache",
  "read",
  "write",
  "output",
  "hit%",
  "sec",
] as const
const HEADER_WITH_COST = [...BASE_HEADER, "cost$"] as const
type HeaderCol = (typeof HEADER_WITH_COST)[number]

const WIDTHS: Record<HeaderCol, number> = {
  turn: 5,
  step: 5,
  bp: 3,
  input: 9,
  noCache: 9,
  read: 9,
  write: 9,
  output: 8,
  "hit%": 6,
  sec: 6,
  cost$: 10,
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function dollars(usd: number): string {
  if (usd === 0) return "$0"
  return `$${usd.toFixed(4)}`
}

function cellsForRow(
  rowData: CacheRow & { turn: string; step: string; bp?: string },
  pricing: Pricing | undefined,
): Record<HeaderCol, string> {
  const cells: Record<HeaderCol, string> = {
    turn: rowData.turn,
    step: rowData.step,
    bp: rowData.bp ?? "-",
    input: String(rowData.inputTokens),
    noCache: String(rowData.noCacheTokens),
    read: String(rowData.cacheReadTokens),
    write: String(rowData.cacheWriteTokens),
    output: String(rowData.outputTokens),
    "hit%": pct(rowData.hitRate),
    sec: rowData.seconds > 0 ? rowData.seconds.toFixed(1) : "-",
    cost$: pricing ? dollars(rowCost(rowData, pricing)) : "",
  }
  return cells
}

function renderRow(
  cells: Record<HeaderCol, string>,
  header: readonly HeaderCol[],
): string {
  return header.map((h) => cells[h].padStart(WIDTHS[h])).join("  ")
}

function headerCols(pricing?: Pricing): readonly HeaderCol[] {
  return pricing ? HEADER_WITH_COST : BASE_HEADER
}

// ---------------------------------------------------------------------------
// Incremental row formatters — for printing live as a conversation
// progresses (one table grows downward instead of duplicating output).
// ---------------------------------------------------------------------------

export function formatTableHeader(pricing?: Pricing): string {
  const header = headerCols(pricing)
  return renderRow(
    Object.fromEntries(header.map((h) => [h, h])) as Record<HeaderCol, string>,
    header,
  )
}

export function formatStepRow(step: StepRow, pricing?: Pricing): string {
  const header = headerCols(pricing)
  return renderRow(
    cellsForRow(
      {
        ...step,
        turn: String(step.turn),
        step: String(step.step),
        bp: step.breakpoints === 0 ? "-" : String(step.breakpoints),
      },
      pricing,
    ),
    header,
  )
}

export function formatTurnRow(turn: TurnRecord, pricing?: Pricing): string {
  const header = headerCols(pricing)
  return renderRow(
    cellsForRow({ ...turn.total, turn: `T${turn.turn}`, step: "-" }, pricing),
    header,
  )
}

export function formatGrandTotalRow(
  conv: ConversationCacheStats,
  pricing?: Pricing,
): string {
  const header = headerCols(pricing)
  return renderRow(
    cellsForRow({ ...conv.total, turn: "TOT", step: "-" }, pricing),
    header,
  )
}

/**
 * Format a full conversation as a fixed-width table: one line per
 * step, a "T<n>" line after each turn with that turn's aggregate,
 * and a final "TOT" line with the conversation grand total.
 *
 * If `pricing` is supplied, an extra `cost$` column is appended
 * showing per-row and total USD cost using the gateway-published
 * per-token rates.
 */
export function formatCacheTable(
  label: string,
  conv: ConversationCacheStats,
  pricing?: Pricing,
): string {
  const header: readonly HeaderCol[] = pricing ? HEADER_WITH_COST : BASE_HEADER
  const lines: string[] = []
  lines.push(`=== ${label} ===`)
  lines.push(
    renderRow(
      Object.fromEntries(header.map((h) => [h, h])) as Record<HeaderCol, string>,
      header,
    ),
  )
  for (const t of conv.turns) {
    for (const s of t.steps) {
      lines.push(formatStepRow(s, pricing))
      for (const edit of s.appliedEdits) {
        lines.push(`      ↪ ${edit}`)
      }
    }
    lines.push(formatTurnRow(t, pricing))
  }
  lines.push(formatGrandTotalRow(conv, pricing))
  return lines.join("\n")
}
