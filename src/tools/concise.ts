/**
 * Concise toolkit (used by strategy 7).
 *
 * Each search/fetch returns a small summary + an opaque id. To get
 * the full body the model has to make a follow-up `fetch_full_*`
 * call — which means the *typical* tool-result we see in context is
 * small and stable, exercising the "tools as cache-friendly
 * retrieval" pattern.
 */

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import {
  authorAt,
  bodyFor,
  phrase,
  titleAt,
  titleFor,
  urlFor,
} from "./fixture"


// ---------------------------------------------------------------------------
// Hit shape
// ---------------------------------------------------------------------------

interface ConciseHit {
  rank: number
  title: string
  url: string
}


function conciseHits(query: string, count: number): ConciseHit[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    title: titleAt(i + query.length),
    url: urlFor(query, i),
  }))
}


// ---------------------------------------------------------------------------
// Toolset
// ---------------------------------------------------------------------------

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
      const changes = Array.from({ length: 10 }, (_, i) => ({
        id: `chg_${1000 + i}`,
        title: titleAt(i),
        author: authorAt(i),
        timestamp: `2026-05-${String(15 - (i % 15)).padStart(2, "0")}T12:0${i % 10}:00Z`,
      }))

      return { changes }
    },
  }),
} satisfies ToolSet


export type ConciseTools = typeof conciseTools
