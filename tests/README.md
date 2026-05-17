# `tests` — higher-level integration tests

Real-API tests that exercise multiple `src/` modules end-to-end.
Each test file is skipped unless gateway creds are present in the
environment (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`).

Unit tests (no API) live next to source as siblings under `src/`.


## Layout

```
tests/
├── caching/            Multi-strategy cache-rate comparison suite
│   ├── caching.test.ts    Thin manifest of test() calls
│   ├── strategies/        One factory per strategy (1, 2, 2b, 3, 4, 5, 6, 7, 8, 9)
│   └── util/              Shared fixture, config, hooks, runStrategy harness
├── step.test.ts        Within-turn cache effect of pinTailBreakpoint
└── injection.test.ts   What does gateway caching:'auto' inject into the
                        outbound HTTP body? (Anthropic Messages API schema)
```


## Running

```sh
# Whole repo
bun --env-file=.env.local test

# Just the caching suite (filter by strategy)
bun run test                # default script: strategies 2, 7, 8
bun --env-file=.env.local test tests/caching/caching.test.ts -t "strategy 9"

# Single integration probe
bun --env-file=.env.local test tests/step.test.ts
bun --env-file=.env.local test tests/injection.test.ts

# Fast unit-only pass (no network)
bun run test:unit
```


## Cost

A full `caching.test.ts` run is real Anthropic Opus 4.7 traffic
through the gateway — budget ~$2–4 per full pass (10 strategies × 20
turns). Single-strategy filters are proportionally cheaper.


## Conventions mirror `src/`

- `@/` imports, no `!`/`as` overrides, modular READMEs, etc.
- Shared helpers within a suite get lifted to that suite's `util/`
  folder (see `tests/caching/util/`).
