Up: [../README.md](../README.md)

# `tests/caching` — gateway / Anthropic cache-rate comparison suite

Drives a shared 20-turn research conversation through 10 different
caching strategies and reports per-step cache hit / write counts +
dollarized cost so we can compare strategies side by side.

Real-API integration test — skipped unless `AI_GATEWAY_API_KEY` or
`VERCEL_OIDC_TOKEN` is in the environment. Budget ~$2–4 for a full
run on Opus 4.7 prices.


## Layout

- [`caching.test.ts`](./caching.test.ts) — one `test()` per
  strategy. Imports a factory + `runStrategy` + a shared
  assertion (`expectStandardCacheProgression`) and asserts the
  cross-strategy contract.
- [`strategies/`](./strategies/) — one file per strategy factory.
- [`util/`](./util/) — shared fixture (`MODEL`, `USER_TURNS`,
  `freshSystemPrompt`), config (`STOP_WHEN`, `REASONING_OPTIONS`,
  `CONTEXT_MANAGEMENT`), composable hooks (`trailingEphemeral`,
  `mirrorTrim`, `ephemeralSystem`), and the `runStrategy` harness.


## Running

```sh
bun --env-file=.env.local test tests/caching/caching.test.ts
```

Pass `-t "strategy 9"` (or any substring) to run just one.


## Why so many strategies

Each strategy isolates ONE knob against an otherwise-identical
neighbour, so the contribution of that knob can be read directly
from a side-by-side per-step table:

- 1 vs 2: gateway `caching: "auto"` alone
- 2 vs 2b: + `pinTailBreakpoint`
- 3 vs 4: gateway auto on top of a manual system-ephemeral
- 5: manual 4-breakpoint window with NO server-side help
- 6: gateway auto + context management defaults
- 7 vs 8: concise vs verbose tools, every other technique constant
- 8 vs 9: gateway auto vs no gateway, at the 4-marker cap
