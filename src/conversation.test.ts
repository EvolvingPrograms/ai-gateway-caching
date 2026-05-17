import { describe, expect, test } from "bun:test"

import { extractAppliedEdits } from "./conversation"


describe("extractAppliedEdits", () => {
  test("returns [] when providerMetadata is null / undefined / primitive", () => {
    expect(extractAppliedEdits(undefined)).toEqual([])
    expect(extractAppliedEdits(null)).toEqual([])
    expect(extractAppliedEdits("not an object")).toEqual([])
    expect(extractAppliedEdits(42)).toEqual([])
  })


  test("returns [] when the anthropic block is missing", () => {
    expect(extractAppliedEdits({})).toEqual([])
    expect(extractAppliedEdits({ openai: {} })).toEqual([])
  })


  test("returns [] when contextManagement is absent", () => {
    expect(extractAppliedEdits({ anthropic: {} })).toEqual([])
  })


  test("returns [] when appliedEdits is empty", () => {
    expect(
      extractAppliedEdits({
        anthropic: { contextManagement: { appliedEdits: [] } },
      }),
    ).toEqual([])
  })


  test("describes a clear_tool_uses edit", () => {
    const out = extractAppliedEdits({
      anthropic: {
        contextManagement: {
          appliedEdits: [
            {
              type: "clear_tool_uses_20250919",
              clearedToolUses: 3,
              clearedInputTokens: 4500,
            },
          ],
        },
      },
    })

    expect(out).toEqual(["cleared 3 tool use(s); freed 4500 tokens"])
  })


  test("describes a clear_thinking edit", () => {
    const out = extractAppliedEdits({
      anthropic: {
        contextManagement: {
          appliedEdits: [
            {
              type: "clear_thinking_20251015",
              clearedThinkingTurns: 2,
              clearedInputTokens: 1200,
            },
          ],
        },
      },
    })

    expect(out).toEqual(["cleared 2 thinking turn(s); freed 1200 tokens"])
  })


  test("describes a compact edit", () => {
    const out = extractAppliedEdits({
      anthropic: {
        contextManagement: {
          appliedEdits: [{ type: "compact_20260112" }],
        },
      },
    })

    expect(out).toEqual(["compaction applied"])
  })


  test("emits one line per edit when several apply on one step", () => {
    const out = extractAppliedEdits({
      anthropic: {
        contextManagement: {
          appliedEdits: [
            {
              type: "clear_thinking_20251015",
              clearedThinkingTurns: 1,
              clearedInputTokens: 800,
            },
            {
              type: "clear_tool_uses_20250919",
              clearedToolUses: 2,
              clearedInputTokens: 3300,
            },
          ],
        },
      },
    })

    expect(out).toHaveLength(2)
    expect(out[0]).toContain("thinking")
    expect(out[1]).toContain("tool use")
  })
})
