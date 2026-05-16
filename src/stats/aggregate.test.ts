import { describe, expect, test } from "bun:test"
import type { LanguageModelUsage } from "ai"

import { aggregateRows, rowFromUsage, summarizeTurns } from "./aggregate"
import type { CacheRow, TurnRecord } from "./types"


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
    const row = rowFromUsage(
      mockUsage({
        inputTokens: 1000,
        noCacheTokens: 200,
        cacheReadTokens: 700,
        cacheWriteTokens: 100,
        outputTokens: 50,
      }),
    )

    expect(row).toEqual({
      inputTokens: 1000,
      noCacheTokens: 200,
      cacheReadTokens: 700,
      cacheWriteTokens: 100,
      outputTokens: 50,
      hitRate: 0.7,
      seconds: 0,
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
      seconds: 0,
    })
  })


  test("hitRate is 0 when inputTokens is 0 (defensive)", () => {
    const row = rowFromUsage(
      mockUsage({ inputTokens: 0, cacheReadTokens: 50 }),
    )

    expect(row.hitRate).toBe(0)
  })


  test("records the supplied wall-clock seconds", () => {
    const row = rowFromUsage(mockUsage({ inputTokens: 100 }), 2.5)

    expect(row.seconds).toBe(2.5)
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
        seconds: 0,
      },
      {
        inputTokens: 1100,
        noCacheTokens: 100,
        cacheReadTokens: 800,
        cacheWriteTokens: 200,
        outputTokens: 60,
        hitRate: 800 / 1100,
        seconds: 0,
      },
    ]

    const agg = aggregateRows(rows)

    expect(agg.inputTokens).toBe(2100)
    expect(agg.cacheReadTokens).toBe(800)
    expect(agg.cacheWriteTokens).toBe(1000)
    expect(agg.hitRate).toBe(800 / 2100)
  })


  test("empty input returns an all-zeroes row", () => {
    expect(aggregateRows([])).toEqual({
      inputTokens: 0,
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      hitRate: 0,
      seconds: 0,
    })
  })


  test("sums seconds across rows", () => {
    const rows: CacheRow[] = [
      {
        inputTokens: 0,
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        hitRate: 0,
        seconds: 1.5,
      },
      {
        inputTokens: 0,
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        hitRate: 0,
        seconds: 2.25,
      },
    ]

    expect(aggregateRows(rows).seconds).toBe(3.75)
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
          seconds: 0,
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
          seconds: 0,
        },
      },
    ]

    const conv = summarizeTurns(turns)

    expect(conv.total.inputTokens).toBe(2100)
    expect(conv.total.cacheReadTokens).toBe(800)
    expect(conv.turns).toBe(turns)
  })
})
