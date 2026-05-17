/**
 * Deterministic fake knowledge base used by both tool kits.
 *
 * Every value derives from a string `seed` via a tiny stable hash, so
 * given the same seed the tools always return byte-identical results.
 * That keeps the cache-rate tests reproducible.
 */

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

export const KB_TITLES = [
  "Cache invalidation patterns at scale",
  "Token-bucket rate limiting in practice",
  "Distributed locks with leases and fencing tokens",
  "Backpressure: where it shows up in real systems",
  "Idempotency keys: design and pitfalls",
  "Sharding by tenant: the boring rules",
  "Read-your-writes in eventually-consistent stores",
  "Failure injection: chaos that actually proves things",
  "Schema evolution with online migrations",
  "Why your retries amplify outages",
  "Observability budgets and what trips them",
  "Queue saturation and the head-of-line problem",
  "Connection pool sizing: arithmetic vs hope",
  "Consistent hashing without the surprise rebalance",
  "Two-phase commit and its quieter alternatives",
  "Hot keys, cold tails, and the cost of fairness",
]

export const PHRASES = [
  "The classic mistake is to evict on write rather than on read.",
  "Latency tails get worse, not better, when you add a hop.",
  "Most production data is hot for minutes, cold for years.",
  "Anything that looks like 'try harder' is a load amplifier.",
  "If you can't reproduce it locally, instrument it remotely.",
  "Idempotency is cheaper than coordination.",
  "Schema is policy; migrations are politics.",
  "A queue is just a buffer pretending to be a database.",
  "Fencing tokens turn an honest mistake into a runtime error.",
  "Two systems that agree on time will eventually disagree.",
  "The fastest call is the one you didn't make.",
  "Backpressure is just saying no with good manners.",
  "Every cache is a lie about the present.",
  "Observability without budgets is just expensive logs.",
  "Retries with jitter buy correlation insurance.",
  "Reads outnumber writes by orders of magnitude in practice.",
  "Compaction is the rent you pay on appended state.",
  "Most outages are configuration changes wearing a costume.",
  "Replication lag is a load-balancing problem in disguise.",
  "Backfills are migrations that admit they are migrations.",
]

export const AUTHORS = ["a.lin", "k.tanaka", "m.rivera", "s.okafor", "j.werner"]

// ---------------------------------------------------------------------------
// Deterministic accessors
// ---------------------------------------------------------------------------

export function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return h
}

/**
 * Pick a value from a non-empty array using `i` modulo length.
 * Throws if `arr` is empty — but every array exported above is
 * known non-empty at module load, so callers can treat this as
 * total. Centralising the lookup lets every accessor below return
 * `T` (not `T | undefined`) without `!` non-null assertions.
 */
function pick<T>(arr: readonly T[], i: number): T {
  if (arr.length === 0) {
    throw new Error("pick: empty array")
  }

  const v = arr[Math.abs(i) % arr.length]
  if (v === undefined) {
    throw new Error("pick: unreachable")
  }
  
  return v
}

export function phrase(seed: string, n: number): string {
  return pick(PHRASES, hash(seed) + n * 17)
}

/** Produce `paragraphs` paragraphs of 4 phrases each, seeded by `seed`. */
export function bodyFor(seed: string, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, p) =>
    Array.from({ length: 4 }, (_, s) => phrase(seed, p * 11 + s * 3)).join(" "),
  ).join("\n\n")
}

export function titleFor(seed: string): string {
  return pick(KB_TITLES, hash(seed))
}

export function urlFor(query: string, i: number): string {
  return `https://kb.example.com/doc/${(query.length * 7 + i) % 9999}`
}

export function authorFor(seed: string): string {
  return pick(AUTHORS, hash(seed))
}

/** Rotate through `KB_TITLES` by a positional index. */
export function titleAt(i: number): string {
  return pick(KB_TITLES, i)
}

/** Rotate through `AUTHORS` by a positional index. */
export function authorAt(i: number): string {
  return pick(AUTHORS, i)
}
