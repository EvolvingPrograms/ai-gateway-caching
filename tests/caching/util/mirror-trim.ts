/**
 * `afterTurn` hook that mirrors Anthropic's server-side
 * `clear_tool_uses_20250919` edits on the local outgoing history.
 *
 * When the server clears N tool uses, the prompt cache is rewritten
 * to a SHORTER prefix. If we keep sending the un-trimmed prefix on
 * the next turn, our outgoing request no longer matches what the
 * server cached, and we eat an extra cache write. This helper reads
 * the per-step `appliedEdits` log, counts how many tool uses the
 * server cleared this turn, and drops the same count from the
 * oldest end of our history so the next outgoing prefix lines up.
 *
 * Pluggable into any strategy's `afterTurn` field.
 */

import { dropOldestToolUses } from "@/src/trim"
import type { ConversationStrategy } from "@/src/conversation"
import type { ToolSet } from "ai"


type MirrorTrim<TOOLS extends ToolSet> = NonNullable<
  ConversationStrategy<TOOLS>["afterTurn"]
>


export function mirrorTrim<TOOLS extends ToolSet>(): MirrorTrim<TOOLS> {
  return (history, turn) => {
    let newlyCleared = 0
    for (const step of turn.steps) {
      for (const edit of step.appliedEdits) {
        const m = edit.match(/cleared (\d+) tool use/)
        if (m && m[1]) newlyCleared += Number(m[1])
      }
    }

    if (newlyCleared === 0) return history
    return dropOldestToolUses(history, newlyCleared)
  }
}
