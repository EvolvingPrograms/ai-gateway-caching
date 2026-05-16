import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import { pinTailBreakpoint, withEphemeralCacheControl } from "../src/breakpoints"

describe("withEphemeralCacheControl", () => {
  test("system message: cache control applied at message level", () => {
    const msg: ModelMessage = { role: "system", content: "you are helpful." }
    const out = withEphemeralCacheControl(msg)
    expect(out.role).toBe("system")
    expect(out.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral" },
    })
  })

  test("system message: preserves any pre-existing providerOptions", () => {
    const msg: ModelMessage = {
      role: "system",
      content: "...",
      providerOptions: { openai: { something: "yes" } },
    }
    const out = withEphemeralCacheControl(msg)
    expect(out.providerOptions).toEqual({
      openai: { something: "yes" },
      anthropic: { cacheControl: { type: "ephemeral" } },
    })
  })

  test("user message with string content: lifted to a single text part with cache control", () => {
    const msg: ModelMessage = { role: "user", content: "hello" }
    const out = withEphemeralCacheControl(msg)
    if (out.role !== "user") throw new Error("role drift")
    expect(Array.isArray(out.content)).toBe(true)
    const parts = out.content as Array<{
      type: string
      text?: string
      providerOptions?: { anthropic?: { cacheControl?: unknown } }
    }>
    expect(parts).toHaveLength(1)
    expect(parts[0]?.type).toBe("text")
    expect(parts[0]?.text).toBe("hello")
    expect(parts[0]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })

  test("user message with array content: cache control on the LAST part only", () => {
    const msg: ModelMessage = {
      role: "user",
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    }
    const out = withEphemeralCacheControl(msg)
    if (out.role !== "user") throw new Error("role drift")
    const parts = out.content as Array<{
      providerOptions?: { anthropic?: { cacheControl?: unknown } }
    }>
    expect(parts[0]?.providerOptions).toBeUndefined()
    expect(parts[1]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })

  test("assistant message with text and tool-call parts: cache control on the LAST part", () => {
    const msg: ModelMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "I'll look it up." },
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "search",
          input: { q: "x" },
        },
      ],
    }
    const out = withEphemeralCacheControl(msg)
    if (out.role !== "assistant") throw new Error("role drift")
    const parts = out.content as Array<{
      type: string
      providerOptions?: { anthropic?: { cacheControl?: unknown } }
    }>
    expect(parts[1]?.type).toBe("tool-call")
    expect(parts[1]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })

  test("tool message: cache control on its tool-result part", () => {
    const msg: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_1",
          toolName: "search",
          output: { type: "json", value: { ok: true } },
        },
      ],
    }
    const out = withEphemeralCacheControl(msg)
    if (out.role !== "tool") throw new Error("role drift")
    const parts = out.content as Array<{
      providerOptions?: { anthropic?: { cacheControl?: unknown } }
    }>
    expect(parts[0]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })

  test("does not mutate the input message", () => {
    const original: ModelMessage = {
      role: "user",
      content: [{ type: "text", text: "hi" }],
    }
    const snapshot = JSON.parse(JSON.stringify(original))
    withEphemeralCacheControl(original)
    expect(original).toEqual(snapshot)
  })

  test("preserves pre-existing providerOptions on an array tail part", () => {
    const msg: ModelMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: "hi",
          providerOptions: { openai: { foo: "bar" } },
        },
      ],
    }
    const out = withEphemeralCacheControl(msg)
    if (out.role !== "user") throw new Error("role drift")
    const parts = out.content as Array<{
      providerOptions?: {
        openai?: { foo?: string }
        anthropic?: { cacheControl?: unknown }
      }
    }>
    expect(parts[0]?.providerOptions?.openai).toEqual({ foo: "bar" })
    expect(parts[0]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })
})

describe("pinTailBreakpoint", () => {
  test("returns undefined for empty messages (passes through to outer settings)", () => {
    expect(pinTailBreakpoint({ messages: [] })).toBeUndefined()
  })

  test("tags only the last message — earlier messages untouched", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: [{ type: "text", text: "ack" }] },
      { role: "user", content: "second" },
    ]
    const out = pinTailBreakpoint({ messages: msgs })
    if (!out) throw new Error("expected messages back")
    expect(out.messages).toHaveLength(3)
    // First two messages identical to inputs (no breakpoint).
    expect(out.messages[0]).toEqual(msgs[0]!)
    expect(out.messages[1]).toEqual(msgs[1]!)
    // Last message has cache_control: ephemeral on its tail part.
    const last = out.messages[2]!
    if (last.role !== "user") throw new Error("role drift")
    const parts = last.content as Array<{
      providerOptions?: { anthropic?: { cacheControl?: unknown } }
    }>
    expect(parts[0]?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    })
  })

  test("does not mutate the input messages array", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ]
    const snapshot = JSON.parse(JSON.stringify(msgs))
    pinTailBreakpoint({ messages: msgs })
    expect(msgs).toEqual(snapshot)
  })
})
