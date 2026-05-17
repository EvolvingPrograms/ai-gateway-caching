import { describe, expect, test } from "bun:test"

import { execToolTest } from "./_exec-test-tool"
import { conciseTools } from "./concise"

describe("conciseTools", () => {
  test("search_knowledge_base returns 8 hits with rank/title/url only (no snippet)", async () => {
    const out = await execToolTest(conciseTools.search_knowledge_base, {
      query: "cache",
    })

    expect(out.total).toBe(8)
    expect(out.hits).toHaveLength(8)
    expect(out.hits[0]?.rank).toBe(1)
    expect(out.hits[0]).not.toHaveProperty("snippet")
  })

  test("fetch_document_summary returns a small payload (no body)", async () => {
    const out = await execToolTest(conciseTools.fetch_document_summary, {
      url: "https://kb.example.com/doc/42",
    })

    expect(out.title).toBeString()
    expect(out.summary).toBeString()
    expect(out).not.toHaveProperty("body")
  })

  test("fetch_full_document returns the full body", async () => {
    const out = await execToolTest(conciseTools.fetch_full_document, {
      url: "https://kb.example.com/doc/42",
    })

    expect(out.title).toBeString()
    expect(out.body.length).toBeGreaterThan(100)
  })

  test("list_recent_changes returns 10 minimal entries (no diffSize or note)", async () => {
    const out = await execToolTest(conciseTools.list_recent_changes, {})

    expect(out.changes).toHaveLength(10)
    expect(out.changes[0]).not.toHaveProperty("note")
    expect(out.changes[0]).not.toHaveProperty("diffSize")
  })

  test("conciseTools and verboseTools both expose search_knowledge_base + list_recent_changes (parity)", () => {
    expect(conciseTools.search_knowledge_base).toBeDefined()
    expect(conciseTools.list_recent_changes).toBeDefined()
  })
})
