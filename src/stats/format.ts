/**
 * Fixed-width table rendering for cache-rate data.
 *
 * Two modes:
 *   - Incremental — call `formatTableHeader`, `formatStepRow`,
 *     `formatTurnRow`, `formatGrandTotalRow` as a conversation
 *     progresses so one table grows downward instead of being
 *     reprinted at end-of-run.
 *   - Whole-run — `formatCacheTable` produces the final block in one
 *     call (header + per-step rows + per-turn aggregate + grand total).
 *
 * If a `Pricing` argument is supplied, the table appends a `cost$`
 * column dollarizing each row.
 */

import { rowCost } from "./aggregate"

import type {
  CacheRow,
  ConversationCacheStats,
  Pricing,
  StepRow,
  TurnRecord,
} from "./types"

// ---------------------------------------------------------------------------
// Column layout
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

// ---------------------------------------------------------------------------
// Cell rendering
// ---------------------------------------------------------------------------

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function dollars(usd: number): string {
  if (usd === 0) {
    return "$0"
  }
  return `$${usd.toFixed(4)}`
}

function cellsForRow(
  rowData: CacheRow & { turn: string; step: string; bp?: string },
  pricing: Pricing | undefined,
): Record<HeaderCol, string> {
  return {
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
// Incremental formatters
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

// ---------------------------------------------------------------------------
// Whole-run formatter
// ---------------------------------------------------------------------------

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
  const lines: string[] = []
  lines.push(`=== ${label} ===`)
  lines.push(formatTableHeader(pricing))

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
