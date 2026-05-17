# `src` — gateway-caching library

Reusable building blocks behind the cache-rate experiments in
`../tests/`. Every file has a sibling `*.test.ts` (unit-level,
no API calls).


## Layout

```
src/
├── breakpoints/        Anthropic cache_control placement utilities
│   ├── ephemeral.ts    withEphemeralCacheControl (per-role tagging)
│   ├── pin-tail.ts     prepareStep hook that tags the last message
│   └── count.ts        countBreakpoints + makeCountingPrepareStep
├── stats/              Cache-rate accounting + table rendering
│   ├── types.ts        CacheRow, StepRow, TurnRecord, Pricing
│   ├── aggregate.ts    rowFromUsage, aggregateRows, summarizeTurns, rowCost
│   └── format.ts       Fixed-width table renderers (incremental + whole-run)
├── tools/              Verbose + concise toolkits for the harness
│   ├── fixture.ts      Deterministic fake KB data + accessors
│   ├── verbose.ts      ~1.5–3k-token tool results
│   └── concise.ts      Small results + opaque ids → follow-up fetches
├── conversation.ts     Multi-turn ToolLoopAgent runner
├── trim.ts             dropOldestToolUses (mirror-trim for clear_tool_uses)
└── pricing.ts          fetchPricing from the AI Gateway catalogue
```


## Conventions

- **Sibling tests.** Every `foo.ts` has a `foo.test.ts` next to it.
  Higher-level integration tests (real API, multi-module) live in
  `../tests/`.
- **`@/` alias.** Cross-directory imports go through `@/` (resolves
  to the repo root). Same-folder imports stay relative (`./foo`).
- **No `!` non-null assertions, no ad-hoc `as` casts.** The trust
  boundary for untyped data is a small, named helper (see
  `readAnthropicMetadata` in `conversation.ts`,
  `execToolTest` in `tools/_exec-test-tool.ts`).
- **Modular READMEs.** Every nested folder has its own README
  linking up to this one.
