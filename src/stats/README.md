Up: [../README.md](../README.md)

# `src/stats` — cache-rate accounting + table rendering

Reshapes AI SDK `LanguageModelUsage` records into a flat, aggregable
shape and renders fixed-width tables for side-by-side strategy
comparisons.


## Files

- [`types.ts`](./types.ts) — `CacheRow`, `StepRow`, `TurnRecord`,
  `ConversationCacheStats`, `Pricing`. Pure types, no logic.
- [`aggregate.ts`](./aggregate.ts) — `rowFromUsage`, `aggregateRows`,
  `summarizeTurns`, `rowCost`. Pure folds; no I/O.
- [`format.ts`](./format.ts) — fixed-width table rendering, both
  incremental (`formatStepRow` / `formatTurnRow` / …) and whole-run
  (`formatCacheTable`).
- [`index.ts`](./index.ts) — public barrel.


## Data model

```
ConversationCacheStats
  ├── turns: TurnRecord[]
  │     ├── steps: StepRow[]   ← one per model generation
  │     └── total: CacheRow    ← sum of this turn's steps
  └── total: CacheRow          ← sum of all turn totals
```

`CacheRow` carries the cache accounting fields (`inputTokens`,
`noCacheTokens`, `cacheReadTokens`, `cacheWriteTokens`,
`outputTokens`, `hitRate`, `seconds`) and is reused for step rows,
turn totals, and the grand total.


## Tests

- [`aggregate.test.ts`](./aggregate.test.ts) — `rowFromUsage` field
  extraction, `aggregateRows` summing + hit-rate recomputation,
  `summarizeTurns` rollup.
- [`format.test.ts`](./format.test.ts) — header / step / turn / TOT
  row rendering, bp='-' when zero, applied-edit indent.
