# gateway-caching

A cache-rate harness for [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
+ Anthropic Claude Opus 4.7. Drives the **same** 20-turn research
conversation through a fleet of caching strategies and reports per-step
hit / write counts + dollarized cost so the contribution of each knob
(gateway `caching: "auto"`, manual `cache_control: ephemeral`,
per-step tail-pin, breakpoint chain, context management, mirror-trim,
concise tools) can be read off a side-by-side table.

The primary goal is **measure the gateway's `caching: "auto"`
baseline and find what's needed to close the gap to the best
hand-tuned strategy** — so the gateway can adopt those behaviours
and the typical caller gets the win for free.


## Headline results

Same 20-turn conversation, 10 strategies, Opus 4.7. The four most
informative runs:

| # | Strategy | Hit% | noCache | Cost | Δ vs baseline |
|---|---|---:|---:|---:|---:|
| 2 | gateway `caching: "auto"` (baseline) | 94% | 245,541 | **$6.29** | — |
| 2b | + `pinTailBreakpoint` (per-step tail) | 97% | 158 | **$5.36** | **-15%** |
| 7 | concise tools + every technique | 95% | 158 | **$1.16** | **-82%** |
| 8 | verbose tools + every technique | 82% | 157 | **$2.26** | **-64%** |


### What we learned

1. **The per-step tail breakpoint is the single biggest free win
   on top of `caching: "auto"`.** Going from strategy 2 → 2b drops
   cost 15% and effectively zeroes the uncached-token column
   (`noCache: 245k → 158`) with no other changes. The gateway adds
   one auto-marker per request; that marker anchors the static
   prefix, but doesn't anchor each within-turn step's freshly
   appended tool-call / tool-result tail. A `prepareStep` that pins
   `cache_control: ephemeral` on the last message before every
   internal generation fixes it.

2. **Concise tool design dominates the rest.** Strategy 7 (concise
   tools) vs 8 (verbose tools) — same techniques, same context
   management, only the tool result size changes — and 7 ends at
   **half the cost** with a higher hit rate. The lesson scales:
   small, opaque-id results that the model can resolve via a
   follow-up `fetch_full_*` call are cache-cheap; verbose
   summary+snippet+excerpt blobs are not.

3. **Context editing was never the bottleneck on this conversation.**
   With `clear_tool_uses_20250919` configured at `trigger:
   600_000 / clearAtLeast: 120_000` (sized for Opus 4.7's 1M window),
   zero edits fired across any 20-turn run — the working set
   peaked around 230k. Earlier exploration showed that firing
   edits aggressively at 22k input *hurts* the cache because the
   server invalidates the prefix downstream of every clear. So the
   right configuration is rare, big edits, not frequent small ones.


### Asks of `caching: "auto"`

If you build on the gateway, the two changes that would close most
of the strategy-2 → strategy-2b gap automatically:

- **Pin a per-step tail breakpoint when running inside a
  multi-step tool loop.** Today the auto-marker only anchors the
  static prefix; the within-turn tool tail stays uncached step-to-
  step. Adding a tail marker per step (or at least per
  `onStepFinish`) gives that 15% basically for free, with no API
  change at the caller.
- **Surface tool-result trimming as a managed knob.** The mirror-
  trim dance (server clears N tool uses → client drops N from the
  local outgoing prefix → next request matches the cached state)
  is fiddly to get right at the caller, and the cache-bust pattern
  is identical across customers. Moving it server-side, with `keep`
  / `clearAtLeast` parity to today's `clear_tool_uses_20250919`,
  would let any `caching: "auto"` user keep a healthy prefix across
  long conversations without re-implementing the same trim.

The strategy 9 result is the upper-bound check: same techniques as
strategy 8 but with `gateway: { caching: "auto" }` **removed** and
manual placement at exactly Anthropic's 4-breakpoint cap. Strategy
9 keeps healthy per-step writes after every edit; strategy 8's
writes collapse post-edit because the gateway's 5th auto-marker
pushes us over the 4-cap and the SDK silently drops the tail-pin.
The fix is for the gateway to *not* add a marker when the user
already has 4.


## Running the suite

```sh
# Default script: filtered to strategies 2, 7, 8
bun run test

# All strategies (real API; budget ~$2–4 per pass on Opus 4.7)
bun --env-file=.env.local test tests/caching/caching.test.ts

# Filter by strategy
bun --env-file=.env.local test tests/caching/caching.test.ts -t "strategy 9"

# Fast unit-only pass (no network)
bun run test:unit
```

The suite skips automatically unless `AI_GATEWAY_API_KEY` or
`VERCEL_OIDC_TOKEN` is set.


## Layout

```
src/                Reusable library — every file has a sibling test
├── breakpoints/    Anthropic cache_control placement utilities
├── stats/          Cache-rate accounting + table rendering
├── tools/          Verbose + concise toolkits + fake-KB fixture
├── conversation.ts Multi-turn ToolLoopAgent runner
├── trim.ts         dropOldestToolUses (mirror-trim)
└── pricing.ts      Per-token rates from the gateway catalogue

tests/              Higher-level integration tests (real API)
├── caching/        Multi-strategy cache-rate comparison
├── step.test.ts    Within-turn effect of pinTailBreakpoint
└── injection.test.ts  What does the gateway inject into the outbound HTTP body?
```

Every nested folder carries its own README that links up to its
parent.


## Conventions

- **Sibling tests.** `foo.ts` + `foo.test.ts` next to it. No `tests/`
  shadow tree under `src/`.
- **`@/` path alias.** Cross-directory imports look the same
  regardless of nesting depth.
- **No compiler escape hatches.** No `!` non-null assertions, no
  ad-hoc `as` casts, no `any`. Trust-boundary coercions are
  isolated into small named helpers (`readAnthropicMetadata`,
  `execToolTest`, `pick`).
- **Modular READMEs.** Every folder explains what it owns and links
  to its parent.


## Stack

- [Bun](https://bun.com) for the runtime, test runner, and bundler.
- [AI SDK v6](https://sdk.vercel.ai) (`ai`, `@ai-sdk/anthropic`,
  `@ai-sdk/gateway`).
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
  as a type-only dev dependency for the outbound HTTP body schema.
- [Zod](https://zod.dev) for tool input schemas.
