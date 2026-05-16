/**
 * Cache-control breakpoint accounting helpers. Lets a strategy
 * observe the number of Anthropic `cache_control: ephemeral` markers
 * actually present on its outgoing prefix, step-by-step.
 *
 * Anthropic caps each request at 4 explicit breakpoints; the gateway's
 * `caching: 'auto'` adds one more server-side that this counter can't
 * see. Use the count to detect when a strategy is overshooting the
 * 4-marker budget (the API silently drops the excess, usually in ways
 * that hurt cache-write anchoring).
 */

import type { ModelMessage } from "ai"

// ---------------------------------------------------------------------------
// Breakpoint counter
// ---------------------------------------------------------------------------

/**
 * Count Anthropic `cache_control` breakpoints in a messages array.
 *
 * Counts a marker on the message itself (system messages place it
 * there) and one on each content part that has one (user / assistant /
 * tool messages place it on parts).
 *
 * Pass `systemHasEphemeral = true` if your strategy supplies the
 * system as a separate `instructions` arg with `cache_control` set —
 * that breakpoint won't appear in `messages` here.
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

// ---------------------------------------------------------------------------
// prepareStep wrapper
// ---------------------------------------------------------------------------

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
