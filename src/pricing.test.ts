/**
 * Live test against AI Gateway's pricing catalogue. The harness's
 * cost columns are only as accurate as `fetchPricing(...)` — if it
 * silently drifts (model id renamed, pricing schema changed, BYOK
 * model with no prices) we want to know.
 *
 * Skipped unless gateway creds are present.
 */

import { describe, expect, test } from "bun:test"

import { fetchPricing } from "./pricing"


const hasGatewayCreds = !!(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
)


describe("fetchPricing", () => {
  test.skipIf(!hasGatewayCreds)(
    "returns positive per-token rates for a real model",
    async () => {
      const pricing = await fetchPricing("anthropic/claude-opus-4.7")

      expect(pricing.inputRate).toBeGreaterThan(0)
      expect(pricing.outputRate).toBeGreaterThan(0)
      expect(pricing.cacheReadRate).toBeGreaterThan(0)
      expect(pricing.cacheWriteRate).toBeGreaterThan(0)
    },
    { timeout: 30_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "cache rates obey Anthropic's published multipliers (read < input < write)",
    async () => {
      const pricing = await fetchPricing("anthropic/claude-opus-4.7")

      // Cache reads are ~0.1× input rate; cache writes are ~1.25×.
      expect(pricing.cacheReadRate).toBeLessThan(pricing.inputRate)
      expect(pricing.cacheWriteRate).toBeGreaterThan(pricing.inputRate)
    },
    { timeout: 30_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "throws for a model that does not exist in the catalogue",
    async () => {
      expect(fetchPricing("anthropic/does-not-exist-9000")).rejects.toThrow(
        /not found/,
      )
    },
    { timeout: 30_000 },
  )
})
