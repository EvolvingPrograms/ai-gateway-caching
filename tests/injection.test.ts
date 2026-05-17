/**
 * Investigation: what shape does AI Gateway actually send to
 * Anthropic when `providerOptions.gateway.caching = 'auto'` is set?
 * Specifically — does the gateway-added `cache_control` breakpoint
 * appear anywhere we can see from the client side?
 *
 * Two places to look:
 *   - `result.request.body` — the raw outbound HTTP body sent to the
 *     provider, after gateway transforms. If the gateway adds a
 *     breakpoint, it shows up here.
 *   - `result.response.messages` — the assistant turns the server
 *     produced. Cache breakpoints live on the INPUT prefix, not the
 *     output, so we expect nothing here.
 *
 * The outbound body is the Anthropic Messages API request schema —
 * we type it via the upstream `@anthropic-ai/sdk` rather than
 * hand-rolling a partial shape.
 *
 * Run: `bun --env-file=.env.local test tests/injection.test.ts`
 */

import { describe, expect, test } from "bun:test"
import type Anthropic from "@anthropic-ai/sdk"
import { generateText, type ModelMessage } from "ai"

const MODEL = "anthropic/claude-opus-4.7"

const LONG_SYSTEM = [
  "You are a curt assistant. Reply with a single short word.",
  Array.from(
    { length: 200 },
    (_, i) =>
      `Note ${i + 1}: padding paragraph to push the system prompt above the cache-eligibility floor. Synthetic content.`,
  ).join(" "),
].join("\n\n")

// ---------------------------------------------------------------------------
// Outbound body inspection
// ---------------------------------------------------------------------------

/**
 * Outbound HTTP body the AI SDK + AI Gateway send to Anthropic. The
 * SDK exposes `result.request.body` as `unknown`, so we narrow at
 * this trust boundary to the upstream Anthropic type.
 */
type OutboundBody = Anthropic.Messages.MessageCreateParams

interface CacheControlMarker {
  location: string
  block: unknown
}

function asOutboundBody(body: unknown): OutboundBody | undefined {
  if (body === null || typeof body !== "object") {
    return undefined
  }

  return body as OutboundBody
}

/**
 * Walk every block / part in the outbound body and report each
 * `cache_control` marker we find. Returns a structured list so the
 * test can assert and the console can show what was injected.
 */
function findCacheControlMarkers(body: unknown): CacheControlMarker[] {
  const b = asOutboundBody(body)
  if (!b) {
    return []
  }

  const out: CacheControlMarker[] = []

  if (Array.isArray(b.tools)) {
    b.tools.forEach((t, i) => {
      if ("cache_control" in t && t.cache_control) {
        out.push({ location: `tools[${i}]`, block: t })
      }
    })
  }

  if (Array.isArray(b.system)) {
    b.system.forEach((s, i) => {
      if ("cache_control" in s && s.cache_control) {
        out.push({ location: `system[${i}]`, block: s })
      }
    })
  }

  if (Array.isArray(b.messages)) {
    b.messages.forEach((m, i) => {
      if (!Array.isArray(m.content)) {
        return
      }

      m.content.forEach((part, j) => {
        if ("cache_control" in part && part.cache_control) {
          out.push({
            location: `messages[${i}].content[${j}]`,
            block: part,
          })
        }
      })
    })
  }

  return out
}

const hasGatewayCreds = !!(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AI Gateway injection visibility", () => {
  test.skipIf(!hasGatewayCreds)(
    "BASELINE: no caching opt-in → no cache_control markers in outbound body",
    async () => {
      const result = await generateText({
        model: MODEL,
        system: LONG_SYSTEM,
        prompt: "Say only the word: alpha.",
      })

      const markers = findCacheControlMarkers(result.request.body)
      console.log("\n--- BASELINE (no opt-in) ---")
      console.log(`markers found: ${markers.length}`)
      for (const m of markers) console.log(`  ${m.location}:`, m.block)
      console.log(
        "response.messages roles:",
        result.response.messages.map((m: ModelMessage) => m.role),
      )
      console.log(
        "providerMetadata keys:",
        Object.keys(result.providerMetadata ?? {}),
      )

      expect(markers).toHaveLength(0)
    },
    { timeout: 60_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "GATEWAY AUTO: providerOptions.gateway.caching='auto' → expect a cache_control marker injected somewhere",
    async () => {
      const result = await generateText({
        model: MODEL,
        system: LONG_SYSTEM,
        prompt: "Say only the word: bravo.",
        providerOptions: { gateway: { caching: "auto" } },
      })

      const markers = findCacheControlMarkers(result.request.body)
      console.log("\n--- GATEWAY AUTO ---")
      console.log(`markers found: ${markers.length}`)
      for (const m of markers) console.log(`  ${m.location}:`, m.block)
      console.log(
        "response.messages roles:",
        result.response.messages.map((m: ModelMessage) => m.role),
      )
      console.log(
        "providerMetadata:",
        JSON.stringify(result.providerMetadata, null, 2),
      )

      // Whatever the gateway added, it should show up here.
      expect(markers.length).toBeGreaterThanOrEqual(1)
    },
    { timeout: 60_000 },
  )

  test.skipIf(!hasGatewayCreds)(
    "MANUAL ephemeral on system + GATEWAY AUTO: do we see one marker or two?",
    async () => {
      const result = await generateText({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: LONG_SYSTEM,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          { role: "user", content: "Say only the word: charlie." },
        ],
        providerOptions: { gateway: { caching: "auto" } },
      })

      const markers = findCacheControlMarkers(result.request.body)
      console.log("\n--- MANUAL + GATEWAY AUTO ---")
      console.log(`markers found: ${markers.length}`)
      for (const m of markers) console.log(`  ${m.location}:`, m.block)
      console.log("warnings:", JSON.stringify(result.warnings ?? [], null, 2))
    },
    { timeout: 60_000 },
  )
})
