/**
 * Apply Anthropic's `cache_control: { type: 'ephemeral' }` breakpoint
 * to a `ModelMessage`. Where the breakpoint lands depends on the
 * message role:
 *
 *   - `system` → message-level `providerOptions.anthropic.cacheControl`
 *     (system messages have a string content, no parts to tag).
 *   - `user` / `assistant` / `tool` → applied to the LAST content
 *     part's `providerOptions`. If `user`/`assistant` content is a
 *     bare string we lift it into a text part first so the
 *     breakpoint has somewhere to live.
 *
 * Tool-approval parts (`tool-approval-request` /
 * `tool-approval-response`) don't expose a `providerOptions` field
 * in the AI SDK's types, so when they happen to be the tail we
 * leave the content unchanged.
 *
 * Returns a NEW message. Inputs are never mutated.
 *
 * The AI SDK's `ProviderOptions` type is `Record<string, JSONObject>`
 * (each provider's options must be JSON-shaped). We construct the
 * Anthropic block as a plain JSON literal — the value happens to
 * match `AnthropicLanguageModelOptions` but we don't type it that
 * way, because `AnthropicLanguageModelOptions` includes optional
 * `undefined`s that fight the `JSONObject` constraint when spread.
 */

import type { ProviderOptions } from "@ai-sdk/provider-utils"
import type {
  AssistantContent,
  AssistantModelMessage,
  ModelMessage,
  SystemModelMessage,
  ToolContent,
  ToolModelMessage,
  UserContent,
  UserModelMessage,
} from "ai"

const ANTHROPIC_EPHEMERAL = {
  cacheControl: { type: "ephemeral" },
} as const

export function withEphemeralCacheControl(msg: ModelMessage): ModelMessage {
  switch (msg.role) {
    case "system":
      return withCacheOnSystem(msg)
    case "user":
      return withCacheOnUser(msg)
    case "assistant":
      return withCacheOnAssistant(msg)
    case "tool":
      return withCacheOnTool(msg)
  }
}

function withCacheOnSystem(msg: SystemModelMessage): SystemModelMessage {
  return {
    ...msg,
    providerOptions: mergeAnthropic(msg.providerOptions),
  }
}

function withCacheOnUser(msg: UserModelMessage): UserModelMessage {
  return { ...msg, content: tagUserContent(msg.content) }
}

function withCacheOnAssistant(
  msg: AssistantModelMessage,
): AssistantModelMessage {
  return { ...msg, content: tagAssistantContent(msg.content) }
}

function withCacheOnTool(msg: ToolModelMessage): ToolModelMessage {
  return { ...msg, content: tagToolContent(msg.content) }
}

function tagUserContent(content: UserContent): UserContent {
  if (typeof content === "string") {
    return [
      {
        type: "text",
        text: content,
        providerOptions: { anthropic: { ...ANTHROPIC_EPHEMERAL } },
      },
    ]
  }
  if (content.length === 0) return content
  const next = content.slice()
  const lastIdx = next.length - 1
  const last = next[lastIdx]!
  // All UserContent parts (TextPart | ImagePart | FilePart) expose
  // providerOptions, so this is always safe.
  next[lastIdx] = {
    ...last,
    providerOptions: mergeAnthropic(last.providerOptions),
  }
  return next
}

function tagAssistantContent(content: AssistantContent): AssistantContent {
  if (typeof content === "string") {
    return [
      {
        type: "text",
        text: content,
        providerOptions: { anthropic: { ...ANTHROPIC_EPHEMERAL } },
      },
    ]
  }
  if (content.length === 0) return content
  const next = content.slice()
  const lastIdx = next.length - 1
  const last = next[lastIdx]!
  // Approval parts don't expose `providerOptions`; leave content
  // alone if the tail happens to be one. (Won't happen in normal
  // tool-loop transcripts but the type union allows it.)
  if (last.type === "tool-approval-request") return next
  next[lastIdx] = {
    ...last,
    providerOptions: mergeAnthropic(last.providerOptions),
  }
  return next
}

function tagToolContent(content: ToolContent): ToolContent {
  if (content.length === 0) return content
  const next = content.slice()
  const lastIdx = next.length - 1
  const last = next[lastIdx]!
  if (last.type === "tool-approval-response") return next
  next[lastIdx] = {
    ...last,
    providerOptions: mergeAnthropic(last.providerOptions),
  }
  return next
}

function mergeAnthropic(
  existing: ProviderOptions | undefined,
): ProviderOptions {
  return {
    ...existing,
    anthropic: {
      ...(existing?.anthropic ?? {}),
      ...ANTHROPIC_EPHEMERAL,
    },
  }
}

// ---------------------------------------------------------------------------
// prepareStep helper
// ---------------------------------------------------------------------------

/**
 * `prepareStep` callback for the AI SDK that pins an ephemeral
 * `cache_control` breakpoint on the LAST message before every
 * internal tool-loop generation. This caches the within-turn tool
 * tail step-by-step: each step's new asst/tool-result pair gets a
 * cache write at the end of step N, then step N+1's request reads
 * it before generating the next.
 *
 * Without this, the gateway's auto-breakpoint only places one
 * marker at the end of static content per request, so each
 * subsequent step's freshly-added tool tail stays uncached and is
 * charged at the full 1.0× rate.
 *
 * Pass directly to a `ToolLoopAgent` constructor:
 *
 *     new ToolLoopAgent({
 *       model: ...,
 *       prepareStep: pinTailBreakpoint,
 *       ...
 *     })
 */
export function pinTailBreakpoint(args: {
  messages: ModelMessage[]
}): { messages: ModelMessage[] } | undefined {
  const { messages } = args
  if (messages.length === 0) return undefined
  const lastIdx = messages.length - 1
  const tagged = messages.slice()
  tagged[lastIdx] = withEphemeralCacheControl(tagged[lastIdx]!)
  return { messages: tagged }
}

/**
 * Count the number of Anthropic `cache_control` breakpoints in a
 * messages array. Counts a marker on the message itself (system
 * messages place it there) and one on each content part that has
 * one (user/assistant/tool messages place it on parts).
 *
 * Pass `systemHasEphemeral = true` if your strategy supplies the
 * system as a separate `instructions` arg with `cache_control`
 * set — that breakpoint won't appear in `messages` here.
 */
export function countBreakpoints(
  messages: readonly ModelMessage[],
  systemHasEphemeral = false,
): number {
  let count = systemHasEphemeral ? 1 : 0
  for (const m of messages) {
    const msgAnthropic = m.providerOptions?.anthropic as
      | { cacheControl?: unknown }
      | undefined
    if (msgAnthropic?.cacheControl) count++
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        const partAnthropic = (
          part as { providerOptions?: { anthropic?: { cacheControl?: unknown } } }
        ).providerOptions?.anthropic
        if (partAnthropic?.cacheControl) count++
      }
    }
  }
  return count
}

/**
 * Build a counting `prepareStep` callback for a `ToolLoopAgent`.
 *
 * Wraps an optional inner prepareStep (e.g. `pinTailBreakpoint`),
 * counts the number of Anthropic `cache_control` breakpoints in the
 * resulting messages, and stashes that count under
 * `result.lastCount`. Each `agent.generate(...)` call resets the
 * counter via the inner closure — the count reflects the LAST
 * step's outgoing breakpoint total at any moment.
 *
 * Note: only counts breakpoints WE set (system if it has ephemeral
 * + per-part markers in messages). Gateway's `caching: 'auto'`
 * adds one more server-side that we can't see from here.
 */
export function makeCountingPrepareStep(args: {
  inner?: (opts: { messages: ModelMessage[] }) => { messages: ModelMessage[] } | undefined
  systemHasEphemeral: boolean
}): {
  prepareStep: (opts: { messages: ModelMessage[] }) =>
    | { messages: ModelMessage[] }
    | undefined
  lastCount: () => number
} {
  let lastCount = 0
  return {
    prepareStep: (opts) => {
      const result = args.inner ? args.inner(opts) : undefined
      const messages = result?.messages ?? opts.messages
      lastCount = countBreakpoints(messages, args.systemHasEphemeral)
      return result
    },
    lastCount: () => lastCount,
  }
}
