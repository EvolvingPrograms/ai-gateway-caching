import { describe, expect, test } from "bun:test"
import type { LanguageModelUsage } from "ai"
import {
  aggregateRows,
  formatCacheTable,
  rowFromUsage,
  summarizeTurns,
  type CacheRow,
  type StepRow,
  type TurnRecord,
} from "../src/cache-stats"

function mockUsage(
  partial: Partial<{
    inputTokens: number
    noCacheTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    outputTokens: number
  }>,
): LanguageModelUsage {
  return {
    inputTokens: partial.inputTokens,
    inputTokenDetails: {
      noCacheTokens: partial.noCacheTokens,
      cacheReadTokens: partial.cacheReadTokens,
      cacheWriteTokens: partial.cacheWriteTokens,
    },
    outputTokens: partial.outputTokens,
    outputTokenDetails: {},
    totalTokens: undefined,
  } as unknown as LanguageModelUsage
}

describe("rowFromUsage", () => {
  test("extracts every cache field from a populated usage", () => {
    expect(
      rowFromUsage(
        mockUsage({
          inputTokens: 1000,
          noCacheTokens: 200,
          cacheReadTokens: 700,
          cacheWriteTokens: 100,
          outputTokens: 50,
        }),
      ),
    ).toEqual({
      inputTokens: 1000,
      noCacheTokens: 200,
      cacheReadTokens: 700,
      cacheWriteTokens: 100,
      outputTokens: 50,
      hitRate: 0.7,
    })
  })

  test("coerces undefined fields to 0", () => {
    expect(rowFromUsage(mockUsage({}))).toEqual({
      inputTokens: 0,
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      hitRate: 0,
    })
  })

  test("hitRate is 0 when inputTokens is 0 (defensive)", () => {
    expect(
      rowFromUsage(mockUsage({ inputTokens: 0, cacheReadTokens: 50 }))
        .hitRate,
    ).toBe(0)
  })
})

describe("aggregateRows", () => {
  test("sums fields and recomputes hitRate from sums (not avg of ratios)", () => {
    const rows: CacheRow[] = [
      {
        inputTokens: 1000,
        noCacheTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 800,
        outputTokens: 50,
        hitRate: 0,
      },
      {
        inputTokens: 1100,
        noCacheTokens: 100,
        cacheReadTokens: 800,
        cacheWriteTokens: 200,
        outputTokens: 60,
        hitRate: 800 / 1100,
      },
    ]
    const agg = aggregateRows(rows)
    expect(agg.inputTokens).toBe(2100)
    expect(agg.cacheReadTokens).toBe(800)
    expect(agg.cacheWriteTokens).toBe(1000)
    expect(agg.hitRate).toBe(800 / 2100)
  })

  test("empty input returns zero row", () => {
    expect(aggregateRows([])).toEqual({
      inputTokens: 0,
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      hitRate: 0,
    })
  })
})

describe("summarizeTurns", () => {
  test("rolls turn totals up into a grand total", () => {
    const turns: TurnRecord[] = [
      {
        turn: 1,
        steps: [],
        total: {
          inputTokens: 1000,
          noCacheTokens: 1000,
          cacheReadTokens: 0,
          cacheWriteTokens: 800,
          outputTokens: 50,
          hitRate: 0,
        },
      },
      {
        turn: 2,
        steps: [],
        total: {
          inputTokens: 1100,
          noCacheTokens: 100,
          cacheReadTokens: 800,
          cacheWriteTokens: 200,
          outputTokens: 60,
          hitRate: 800 / 1100,
        },
      },
    ]
    const conv = summarizeTurns(turns)
    expect(conv.total.inputTokens).toBe(2100)
    expect(conv.total.cacheReadTokens).toBe(800)
    expect(conv.turns).toBe(turns)
  })
})

describe("formatCacheTable", () => {
  test("prints header, per-step rows, per-turn aggregate, and final TOT", () => {
    const steps: StepRow[] = [
      {
        turn: 1,
        step: 1,
        inputTokens: 1000,
        noCacheTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 800,
        outputTokens: 50,
        hitRate: 0,
        appliedEdits: [],
        breakpoints: 1,
      },
      {
        turn: 1,
        step: 2,
        inputTokens: 1100,
        noCacheTokens: 100,
        cacheReadTokens: 1000,
        cacheWriteTokens: 0,
        outputTokens: 30,
        hitRate: 1000 / 1100,
        appliedEdits: ["cleared 2 tool uses; freed 800 tokens"],
        breakpoints: 1,
      },
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
