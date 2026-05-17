Up: [../README.md](../README.md)

# `tests/caching/strategies` — one factory per cache-rate strategy

Each file exports exactly one strategy factory consumed by
`../caching.test.ts`. The factories all share the same shape:

```ts
(systemPrompt: string) => ConversationStrategy<TOOLS>
```

so the test harness can swap them out without conditional plumbing.


## Catalogue

| File | Strategy |
|---|---|
| [`strat-1-no-opt-in.ts`](./strat-1-no-opt-in.ts) | string instructions, no caching opt-in |
| [`strat-2-gateway-auto.ts`](./strat-2-gateway-auto.ts) | + `gateway.caching = "auto"` |
| [`strat-2b-gateway-auto-with-prepare-step.ts`](./strat-2b-gateway-auto-with-prepare-step.ts) | strategy 2 + `pinTailBreakpoint` |
| [`strat-3-system-ephemeral.ts`](./strat-3-system-ephemeral.ts) | `SystemModelMessage` + manual ephemeral |
| [`strat-4-system-ephemeral-with-gateway-auto.ts`](./strat-4-system-ephemeral-with-gateway-auto.ts) | strategy 3 + gateway auto |
| [`strat-5-four-breakpoints.ts`](./strat-5-four-breakpoints.ts) | system + last-3 history ephemeral (4 markers) |
| [`strat-6-gateway-auto-with-context-management.ts`](./strat-6-gateway-auto-with-context-management.ts) | gateway auto + `CONTEXT_MANAGEMENT` |
| [`strat-7-concise-all-techniques.ts`](./strat-7-concise-all-techniques.ts) | concise tools + every technique |
| [`strat-8-verbose-all-techniques.ts`](./strat-8-verbose-all-techniques.ts) | verbose tools + every technique |
| [`strat-9-manual-no-gateway.ts`](./strat-9-manual-no-gateway.ts) | manual 4-bp budget, no gateway auto |


## Conventions

- Pull shared config (`MODEL`, `STOP_WHEN`, `REASONING_OPTIONS`,
  `CONTEXT_MANAGEMENT`) and shared helpers (`ephemeralSystem`,
  `trailingEphemeral`, `mirrorTrim`) from `../util`.
- One factory per file; the file's doc comment names the unique
  property the strategy isolates.
- Strategy labels stay versioned ("1.", "2b.", …) so streaming
  console output matches the catalogue here without translation.
