/**
 * Tool kit for the cache-rate harness.
 *
 * Two flavors:
 *   - `verboseTools` — each call returns a hefty deterministic payload
 *     (~1.5–3k tokens). Used by strategies 1–6 so we can observe what
 *     happens when tool results bloat the context.
 *   - `conciseTools` — each call returns a short summary + an opaque
 *     id; a second `fetch_full_*` tool retrieves the body on demand.
 *     Used by strategy 7 — the "tools as cache-friendly retrieval"
 *     pattern. Total context stays small unless the model explicitly
 *     asks for more.
 *
 * Both kits are stateless and deterministic so the tests are
 * repeatable.
 */

import { tool, type ToolSet } from "ai"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

const KB_TITLES = [
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

const PHRASES = [
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

function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return h
}

function phrase(seed: string, n: number): string {
  return PHRASES[Math.abs(hash(seed) + n * 17) % PHRASES.length]!
}

function bodyFor(seed: string, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, p) =>
    Array.from({ length: 4 }, (_, s) => phrase(seed, p * 11 + s * 3)).join(" "),
  ).join("\n\n")
}

function titleFor(seed: string): string {
  return KB_TITLES[hash(seed) % KB_TITLES.length]!
}

function urlFor(query: string, i: number): string {
  return `https://kb.example.com/doc/${(query.length * 7 + i) % 9999}`
}

// ---------------------------------------------------------------------------
// Verbose tools (used by strategies 1–6)
// ---------------------------------------------------------------------------

interface VerboseHit {
  rank: number
  title: string
  url: string
  snippet: string
  excerpt: string
  publishedAt: string
}

function verboseHits(query: string, count: number): VerboseHit[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    title: KB_TITLES[(i + query.length) % KB_TITLES.length]!,
    url: urlFor(query, i),
    snippet: phrase(query, i),
    excerpt: [phrase(query, i * 3), phrase(query, i * 3 + 1), phrase(query, i * 3 + 2)].join(" "),
    publishedAt: `2026-${String(((i * 3) % 12) + 1).padStart(2, "0")}-${String(((i * 7) % 28) + 1).padStart(2, "0")}T08:00:00Z`,
  }))
}

export const verboseTools = {
  search_knowledge_base: tool({
    description:
      "Search the internal knowledge base. Returns the top 12 hits with titles, URLs, snippets, longer excerpts, and timestamps. Call this FIRST whenever the user asks you to look something up.",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => ({
      query,
      total: 12,
      hits: verboseHits(query, 12),
      relatedQueries: [
        `${query} best practices`,
        `${query} anti-patterns`,
        `${query} case study`,
        `${query} 2026`,
      ],
    }),
  }),

  fetch_document: tool({
    description:
      "Fetch the full text of a knowledge-base document by URL. Returns ~1500 tokens of body content plus metadata. Call this for each document you want to actually quote from.",
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }: { url: string }) => {
      const body = bodyFor(url, 18)
      const sections = Array.from({ length: 6 }, (_, i) => ({
        heading: `${i + 1}. ${KB_TITLES[(hash(url) + i) % KB_TITLES.length]!}`,
        summary: phrase(url, i + 41),
      }))
      return {
        url,
        title: titleFor(url),
        author: ["a.lin", "k.tanaka", "m.rivera", "s.okafor", "j.werner"][
          hash(url) % 5
        ]!,
        publishedAt: "2026-03-14T08:00:00Z",
        wordCount: body.split(/\s+/).length,
        sections,
        body,
        relatedUrls: Array.from(
          { length: 6 },
          (_, i) =>
            `https://kb.example.com/doc/${(hash(url) + i * 13) % 9999}`,
        ),
        fetchedAt: "2026-05-16T00:00:00Z",
      }
    },
  }),

  list_recent_changes: tool({
    description:
      "List the 20 most recent changes in the knowledge base, with timestamps, authors, and short notes.",
    inputSchema: z.object({}),
    execute: async () => {
      const authors = ["a.lin", "k.tanaka", "m.rivera", "s.okafor", "j.werner"]
      const changes = Array.from({ length: 20 }, (_, i) => ({
        id: `chg_${1000 + i}`,
        title: KB_TITLES[i % KB_TITLES.length]!,
        author: authors[i % authors.length]!,
        timestamp: `2026-05-${String(15 - (i % 15)).padStart(2, "0")}T12:0${i % 10}:00Z`,
        note: phrase("changes", i),
        diffSize: 50 + ((i * 7) % 400),
      }))
      return { total: changes.length, changes }
    },
  }),
} satisfies ToolSet

export type VerboseTools = typeof verboseTools

// Backwards-compatibility alias used by the older strategies' types.
export const testTools = verboseTools
export type TestTools = VerboseTools

// ---------------------------------------------------------------------------
// Concise tools (used by strategy 7)
//
// Each search/fetch returns a small summary + an opaque id. To get
// the full body the model has to make a follow-up `fetch_full_*`
// call — which means the *typical* tool-result we see in context is
// small and stable.
// ---------------------------------------------------------------------------

interface ConciseHit {
  rank: number
  title: string
  url: string
}

function conciseHits(query: string, count: number): ConciseHit[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    title: KB_TITLES[(i + query.length) % KB_TITLES.length]!,
    url: urlFor(query, i),
  }))
}

export const conciseTools = {
  search_knowledge_base: tool({
    description:
      "Search the internal knowledge base. Returns the top 8 hits, each with just a title and URL — no snippet. Call `fetch_document_summary` to get a one-line summary for a URL, or `fetch_full_document` for the full body.",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => ({
      query,
      total: 8,
      hits: conciseHits(query, 8),
    }),
  }),

  fetch_document_summary: tool({
    description:
      "Fetch a one-paragraph summary of a knowledge-base document by URL. Prefer this over `fetch_full_document` unless you need direct quotes — summaries are designed to be cache-friendly.",
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }: { url: string }) => ({
      url,
      title: titleFor(url),
      summary: phrase(url, 7),
    }),
  }),

  fetch_full_document: tool({
    description:
      "Fetch the FULL body of a knowledge-base document by URL — only call when a summary is insufficient. Returns ~1500 tokens.",
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }: { url: string }) => ({
      url,
      title: titleFor(url),
      body: bodyFor(url, 18),
    }),
  }),

  list_recent_changes: tool({
    description:
      "List the 10 most recent knowledge-base changes (id + title + author + timestamp only).",
    inputSchema: z.object({}),
    execute: async () => {
      const authors = ["a.lin", "k.tanaka", "m.rivera", "s.okafor", "j.werner"]
      const changes = Array.from({ length: 10 }, (_, i) => ({
        id: `chg_${1000 + i}`,
        title: KB_TITLES[i % KB_TITLES.length]!,
        author: authors[i % authors.length]!,
        timestamp: `2026-05-${String(15 - (i % 15)).padStart(2, "0")}T12:0${i % 10}:00Z`,
      }))
      return { changes }
    },
  }),
} satisfies ToolSet

export type ConciseTools = typeof conciseTools
