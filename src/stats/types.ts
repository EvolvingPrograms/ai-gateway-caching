/**
 * Cache-rate accounting types for generateText / streamText /
 * ToolLoopAgent calls.
 *
 * The AI SDK normalizes provider-specific cache reporting into
 * `LanguageModelUsage.inputTokenDetails`. We re-shape it into a flat
 * record + summarize at the step / turn / conversation level.
 *
 * Hierarchy:
 *   - `CacheRow`               — one model generation (one step OR
 *                                one aggregated turn). Same shape
 *                                either way.
 *   - `TurnRecord`             — a turn = N steps + an aggregate row.
 *   - `ConversationCacheStats` — turns[] + grand total.
 *
 * Field meanings (Anthropic-style accounting, normalized by the SDK):
 *   - `inputTokens`      — total billable input.
 *   - `noCacheTokens`    — input charged at the standard rate.
 *   - `cacheReadTokens`  — input served from prompt cache.
 *   - `cacheWriteTokens` — input written to prompt cache this call.
 *   - `outputTokens`     — model output.
 *   - `hitRate`          — `cacheReadTokens / inputTokens` in [0, 1].
 *   - `seconds`          — wall-clock seconds for the call(s).
 */

export interface CacheRow {
  inputTokens: number
  noCacheTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  hitRate: number
  /** Wall-clock seconds for the call(s) this row represents. */
  seconds: number
}

export interface StepRow extends CacheRow {
  turn: number
  step: number
  /**
   * Number of cache_control breakpoints WE set on this step's
   * outgoing prefix (system if it had ephemeral + per-part markers
   * in messages). Does NOT count gateway's auto-added breakpoint —
   * that's added server-side and invisible from our request.
   */
  breakpoints: number
  /**
   * One-line summaries of any context-editing operations Anthropic
   * applied to this step's prompt (e.g. "cleared 3 tool uses; freed
   * 4500 tokens", "compaction applied"). Empty array if no edits.
   */
  appliedEdits: string[]
}

export interface TurnRecord {
  turn: number
  steps: StepRow[]
  total: CacheRow
}

export interface ConversationCacheStats {
  turns: TurnRecord[]
  total: CacheRow
}

/**
 * Per-token USD pricing for a model, mirrors the shape AI Gateway
 * publishes via `gateway.getAvailableModels()`.
 */
export interface Pricing {
  /** USD per uncached input token (the standard input rate). */
  inputRate: number
  /** USD per output token. */
  outputRate: number
  /** USD per cache-read input token (Anthropic's 0.1× rate). */
  cacheReadRate: number
  /** USD per cache-creation/write input token (Anthropic's 1.25× rate). */
  cacheWriteRate: number
}
