# gateway-caching

A cache-rate harness for [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
+ Anthropic Claude Opus 4.7. Drives the **same** 20-turn research
conversation through a fleet of caching strategies and reports
per-step hit / write counts + dollarized cost so the contribution
of each knob (gateway `caching: "auto"`, manual `cache_control:
ephemeral`, per-step tail-pin, breakpoint chain, context management,
mirror-trim, concise tools) can be read off a side-by-side table.

Built to answer one question: **what does the gateway's
`caching: "auto"` leave on the table, and what would it take to
close the gap?**


## Headline result

Same 20-turn conversation, Opus 4.7, four most informative
strategies:

| # | Strategy | Hit% | noCache | Cost | Δ vs baseline |
|---|---|---:|---:|---:|---:|
| 2 | gateway `caching: "auto"` (baseline) | 94% | 245,541 | **$6.29** | — |
| 2b | + per-step tail-pin (`prepareStep`) | 97% | **158** | **$5.36** | **-15%** |
| 7 | concise tools + every technique | 95% | 158 | **$1.16** | **-82%** |
| 8 | verbose tools + every technique | 82% | 157 | **$2.26** | **-64%** |

Strategy 2 → 2b is **one change**: pin `cache_control: ephemeral`
on the last message before every internal tool-loop step.
Everything else is identical — same provider options, same tools,
same conversation. That single change collapses uncached tokens
from **245k → 158** and saves **15%** on a real-API run. Every
strategy that lands lower (7, 8, 9, …) is *also* doing this — it's
the prerequisite, not the optimisation.


## Asks of `caching: "auto"`

Two changes that would land most of the 2 → 2b gap inside the
gateway, with no caller-side API change:

1. **Pin a per-step tail breakpoint when running inside a
   multi-step tool loop.** Today the auto-marker anchors the static
   prefix but not the within-turn tool tail. Add one ephemeral
   marker on the last message before each step (or equivalently, on
   each `onStepFinish`) and the average `caching: "auto"` user gets
   ~15% off Anthropic spend automatically.

2. **Don't add a 5th server-side marker when the caller is already
   at 4.** Anthropic caps requests at 4 `cache_control` markers.
   Strategy 8 vs 9 shows that overshooting the cap causes the SDK
   to silently drop *the wrong* marker (the per-step tail-pin),
   which collapses post-edit cache writes. If the caller already
   has 4, the gateway should sit out.

Optional but compounding:

3. **Surface tool-result trimming as a managed feature.** The
   mirror-trim dance (server clears N tool uses via
   `clear_tool_uses_20250919` → client drops the same N from the
   local outgoing prefix → next request matches the cached state)
   is identical across customers and fiddly to get right at the
   caller. Moving it inside `caching: "auto"` removes a foot-gun
   and keeps long conversations on a clean cached prefix.

Secondary observation, not a gateway change: **concise tool design
is the dominant cost lever once the cache is anchored.** Strategy 7
vs 8 — same techniques, only the tool result shape differs — cuts
cost in half. Worth a one-pager in the gateway docs: opaque-id
results with on-demand `fetch_full_*` follow-ups beat verbose
summary+snippet+excerpt blobs by 2× at scale.


## Running

```sh
# Default script: strategies 2, 7, 8 (the most informative trio)
bun run test

# All strategies (real API; budget ~$2–4 per pass on Opus 4.7)
bun --env-file=.env.local test tests/caching/caching.test.ts

# Filter by strategy
bun --env-file=.env.local test tests/caching/caching.test.ts -t "strategy 9"

# Fast unit-only pass (no network)
bun run test:unit
```

Skips automatically unless `AI_GATEWAY_API_KEY` or
`VERCEL_OIDC_TOKEN` is set.


## Layout

```
src/                Reusable library — every file has a sibling test
├── breakpoints/    cache_control placement utilities
├── stats/          Cache-rate accounting + table rendering
├── tools/          Verbose + concise toolkits + fake-KB fixture
├── conversation.ts Multi-turn ToolLoopAgent runner
├── trim.ts         dropOldestToolUses (mirror-trim helper)
└── pricing.ts      Per-token rates from the gateway catalogue

tests/              Higher-level integration tests (real API)
├── caching/        Multi-strategy comparison (10 strategies)
├── step.test.ts    Within-turn effect of pinTailBreakpoint
└── injection.test.ts  Inspects the outbound HTTP body the gateway sends
```
