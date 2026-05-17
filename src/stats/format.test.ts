import { describe, expect, test } from "bun:test"

import { aggregateRows, summarizeTurns } from "./aggregate"
import {
  formatCacheTable,
  formatGrandTotalRow,
  formatStepRow,
  formatTableHeader,
  formatTurnRow,
} from "./format"
import type { StepRow, TurnRecord } from "./types"

function makeStep(overrides: Partial<StepRow>): StepRow {
  return {
    turn: 1,
    step: 1,
    inputTokens: 0,
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    hitRate: 0,
    seconds: 0,
    appliedEdits: [],
    breakpoints: 0,
    ...overrides,
  }
}

describe("formatCacheTable", () => {
  test("prints header, per-step rows, per-turn aggregate, and final TOT", () => {
    const steps: StepRow[] = [
      makeStep({
        step: 1,
        inputTokens: 1000,
        noCacheTokens: 1000,
        cacheWriteTokens: 800,
        outputTokens: 50,
        breakpoints: 1,
      }),
      makeStep({
        step: 2,
        inputTokens: 1100,
        noCacheTokens: 100,
        cacheReadTokens: 1000,
        outputTokens: 30,
        hitRate: 1000 / 1100,
        appliedEdits: ["cleared 2 tool uses; freed 800 tokens"],
        breakpoints: 1,
      }),
    ]
    const turn1: TurnRecord = {
      turn: 1,
      steps,
      total: aggregateRows(steps),
    }

    const out = formatCacheTable("strat-X", summarizeTurns([turn1]))

    expect(out).toContain("=== strat-X ===")
    expect(out).toContain("turn")
    expect(out).toContain("hit%")
    expect(out.split("\n").filter((l) => l.startsWith("    1"))).toHaveLength(2)
    expect(out).toContain("T1")
    expect(out).toContain("TOT")

    // Edit summaries indent under their parent step row.
    expect(out).toContain("↪ cleared 2 tool uses; freed 800 tokens")
  })
})

describe("incremental formatters", () => {
  test("formatTableHeader emits column names", () => {
    const header = formatTableHeader()

    expect(header).toContain("turn")
    expect(header).toContain("input")
    expect(header).toContain("hit%")
    expect(header).toContain("sec")
  })

  test("formatStepRow with 0 breakpoints renders bp as '-'", () => {
    const row = formatStepRow(makeStep({ breakpoints: 0 }))

    // Find the bp column (4 chars: 5 + 5 + 2 separator + width 3 → look for " - ")
    expect(row).toMatch(/^\s+1\s+1\s+-/)
  })

  test("formatStepRow renders a non-zero breakpoint count", () => {
    const row = formatStepRow(makeStep({ breakpoints: 3 }))

    expect(row).toMatch(/^\s+1\s+1\s+3/)
  })

  test("formatTurnRow labels the turn 'T<n>' with step '-'", () => {
    const turn: TurnRecord = {
      turn: 2,
      steps: [],
      total: aggregateRows([]),
    }

    expect(formatTurnRow(turn)).toMatch(/^\s+T2\s+-/)
  })

  test("formatGrandTotalRow labels the conversation 'TOT'", () => {
    const conv = summarizeTurns([])

    expect(formatGrandTotalRow(conv)).toMatch(/^\s+TOT\s+-/)
  })
})
