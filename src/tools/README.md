Up: [../README.md](../README.md)

# `src/tools` — toolkits for the cache-rate harness

Two flavors of the same fake "knowledge base" tools, used to compare
how cache hit rates respond to verbose vs concise tool results.


## Files

- [`fixture.ts`](./fixture.ts) — shared deterministic data
  (`KB_TITLES`, `PHRASES`, `AUTHORS`) and seeded accessors (`hash`,
  `phrase`, `titleFor`, `urlFor`, `bodyFor`, `authorFor`). Both
  toolkits derive their results from this so the tests are byte-for-byte
  repeatable.
- [`verbose.ts`](./verbose.ts) — `verboseTools` returns hefty
  payloads (~1.5–3k tokens per call). Used by strategies 1–6 to
  observe how bloated tool results affect cache behaviour. Also
  exports the `testTools` / `TestTools` aliases used by the older
  strategies.
- [`concise.ts`](./concise.ts) — `conciseTools` returns small
  summaries + an opaque id; bodies require a follow-up
  `fetch_full_document` call. Used by strategy 7 — the "tools as
  cache-friendly retrieval" pattern.
- [`index.ts`](./index.ts) — public barrel.


## When to use which

| Goal | Toolkit |
|---|---|
| Stress-test the cache with big tool results | `verboseTools` |
| Keep typical context small; only pull bodies on demand | `conciseTools` |


## Tests

- [`fixture.test.ts`](./fixture.test.ts) — determinism + value-set
  coverage for every helper.
- [`verbose.test.ts`](./verbose.test.ts) — output shape + size for
  each verbose tool, plus the `testTools` alias contract.
- [`concise.test.ts`](./concise.test.ts) — confirms the concise
  payloads strip snippets / bodies / metadata that the verbose
  versions include.
