Up: [../README.md](../README.md)

# `tests/caching/util` — shared helpers for the caching suite

Anything used by more than one strategy lives here.


## Files

- [`fixture.ts`](./fixture.ts) — `MODEL`, `USER_TURNS`, and
  `freshSystemPrompt()` (UUID-nonced so each strategy starts COLD
  against Anthropic's prompt cache).
- [`config.ts`](./config.ts) — `STOP_WHEN`, `REASONING_OPTIONS`,
  `CONTEXT_MANAGEMENT`. Held constant across strategies so cache-rate
  deltas reflect breakpoint choices, not thinking-budget noise.
- [`system.ts`](./system.ts) — `ephemeralSystem(prompt)` builds a
  `SystemModelMessage` with `cache_control: ephemeral`.
- [`trailing-ephemeral.ts`](./trailing-ephemeral.ts) —
  `trailingEphemeral(n)` produces a `transform` that pins ephemeral
  on the last `n` history messages.
- [`mirror-trim.ts`](./mirror-trim.ts) — `mirrorTrim()` produces
  an `afterTurn` that drops the same N oldest tool uses the server
  cleared this turn, so next outgoing prefix matches the server's
  cached state.
- [`run-strategy.ts`](./run-strategy.ts) — `runStrategy(factory)`
  drives one strategy through `USER_TURNS`, streams a dollarized
  per-step table to the console, and returns the result.
- [`index.ts`](./index.ts) — barrel.
