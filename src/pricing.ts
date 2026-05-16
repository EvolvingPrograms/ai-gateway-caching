/**
 * Fetch per-token USD pricing for a specific model from AI Gateway's
 * authoritative published rates. Used by the cache-rate harness to
 * dollarize each strategy's run instead of comparing token counts
 * with memorized multipliers.
 *
 * The gateway publishes pricing as decimal strings; we coerce to
 * numbers once here.
 */

import { gateway } from "@ai-sdk/gateway"
import type { Pricing } from "./cache-stats"

/**
 * Look up a model's per-token USD rates from the gateway's model
 * catalogue. Throws if the model isn't found or doesn't publish
 * pricing (some BYOK shapes don't).
 */
export async function fetchPricing(modelId: string): Promise<Pricing> {
  const { models } = await gateway.getAvailableModels()
  const entry = models.find((m) => m.id === modelId)
  if (!entry) {
    throw new Error(
      `model not found in gateway catalogue: ${modelId}`,
    )
  }
  const p = entry.pricing
  if (!p) {
    throw new Error(`model ${modelId} has no published pricing`)
  }
  return {
    inputRate: Number(p.input),
    outputRate: Number(p.output),
    // For models without prompt caching, these default to the input
    // rate (caching just doesn't change cost).
    cacheReadRate: p.cachedInputTokens
      ? Number(p.cachedInputTokens)
      : Number(p.input),
    cacheWriteRate: p.cacheCreationInputTokens
      ? Number(p.cacheCreationInputTokens)
      : Number(p.input),
  }
}
