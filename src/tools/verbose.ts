/**
 * Verbose toolkit (used by strategies 1–6).
 *
 * Each call returns a hefty deterministic payload (~1.5–3k tokens) so
 * the cache-rate harness can observe what happens when tool results
 * bloat the context. Stateless + seeded → repeatable.
 */

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import {
  authorAt,
  authorFor,
  bodyFor,
  hash,
  phrase,
  titleAt,
  titleFor,
  urlFor,
} from "./fixture"

// ---------------------------------------------------------------------------
// Hit shape
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
    title: titleAt(i + query.length),
    url: urlFor(query, i),
    snippet: phrase(query, i),
    excerpt: [
      phrase(query, i * 3),
      phrase(query, i * 3 + 1),
      phrase(query, i * 3 + 2),
    ].join(" "),
    publishedAt: `2026-${String(((i * 3) % 12) + 1).padStart(2, "0")}-${String(((i * 7) % 28) + 1).padStart(2, "0")}T08:00:00Z`,
  }))
}

// ---------------------------------------------------------------------------
// Toolset
// ---------------------------------------------------------------------------

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
        heading: `${i + 1}. ${titleAt(hash(url) + i)}`,
        summary: phrase(url, i + 41),
      }))

      return {
        url,
        title: titleFor(url),
        author: authorFor(url),
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
      const changes = Array.from({ length: 20 }, (_, i) => ({
        id: `chg_${1000 + i}`,
        title: titleAt(i),
        author: authorAt(i),
        timestamp: `2026-05-${String(15 - (i % 15)).padStart(2, "0")}T12:0${i % 10}:00Z`,
        note: phrase("changes", i),
        diffSize: 50 + ((i * 7) % 400),
      }))

      return { total: changes.length, changes }
    },
  }),
} satisfies ToolSet

export type VerboseTools = typeof verboseTools

// Backwards-compatibility aliases used by the older strategies' types.
export const testTools = verboseTools
export type TestTools = VerboseTools
