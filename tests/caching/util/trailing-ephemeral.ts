/**
 * `transform` hook that pins ephemeral cache_control on the last `n`
 * messages of the running history before each turn. Combined with a
 * system-level ephemeral and a per-step `pinTailBreakpoint`, this
 * lets a strategy spend its 4-breakpoint budget deliberately:
 *
 *   system (1) + last-n trailing history (n) + tail pin (1) ≤ 4
 *
 * Pluggable into any strategy's `transform` field.
 */

import { withEphemeralCacheControl } from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import type { ToolSet } from "ai"


type Transform<TOOLS extends ToolSet> = NonNullable<
  ConversationStrategy<TOOLS>["transform"]
>


export function trailingEphemeral<TOOLS extends ToolSet>(
  count: number,
): Transform<TOOLS> {
  return (history) =>
    history.map((m, i) => {
      const fromEnd = history.length - 1 - i
      return fromEnd < count ? withEphemeralCacheControl(m) : m
    })
}
