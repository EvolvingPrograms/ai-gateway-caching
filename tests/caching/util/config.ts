/**
 * Shared Anthropic-side configuration applied across every strategy.
 *
 *   - `STOP_WHEN` caps each turn at 12 internal generations (enough
 *     for 1 search → 3-5 fetches → 1 synthesis with headroom).
 *   - `REASONING_OPTIONS` turns on Opus 4.7 adaptive thinking at
 *     `effort: "medium"`. Held constant so cache-rate deltas across
 *     strategies aren't being washed out by thinking-budget noise,
 *     and because `clear_thinking_20251015` errors out if thinking
 *     is disabled entirely.
 *   - `CONTEXT_MANAGEMENT` is sized for Opus 4.7's 1M context window.
 *     Every context edit invalidates the cache from the edit point
 *     onward, so we push triggers WAY up to delay invalidation and
 *     make each clear BIG so the post-edit cache write amortizes
 *     over many later reads. Compaction is intentionally commented
 *     out — it rewrites the entire history, which is the maximum
 *     blast-radius cache invalidation.
 */

import { stepCountIs } from "ai"
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"


export const STOP_WHEN = stepCountIs(12)


export const REASONING_OPTIONS: Pick<
  AnthropicLanguageModelOptions,
  "thinking" | "effort"
> = {
  thinking: { type: "adaptive" },
  effort: "medium",
}


export const CONTEXT_MANAGEMENT: AnthropicLanguageModelOptions["contextManagement"] = {
  edits: [
    {
      type: "clear_thinking_20251015",
      keep: { type: "thinking_turns", value: 20 },
    },
    {
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 600_000 },
      keep: { type: "tool_uses", value: 20 },
      clearAtLeast: { type: "input_tokens", value: 120_000 },
      clearToolInputs: false,
    },
    // Compaction disabled for now — it rewrites the entire history,
    // which is the maximum-blast-radius cache invalidation. Revisit
    // once tool-use clearing alone proves insufficient.
    // {
    //   type: "compact_20260112",
    //   trigger: { type: "input_tokens", value: 800_000 },
    //   instructions:
    //     "Summarize the conversation concisely, preserving the topics researched, key facts cited, and any tool-result URLs the user might reference later.",
    //   pauseAfterCompaction: false,
    // },
  ],
}
