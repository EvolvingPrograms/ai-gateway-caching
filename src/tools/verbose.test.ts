import { describe, expect, test } from "bun:test"

import { execToolTest } from "./_exec-test-tool"
import { testTools, verboseTools } from "./verbose"


describe("verboseTools", () => {
  test("search_knowledge_base returns 12 hits with rank/title/url/snippet", async () => {
    const out = await execToolTest(verboseTools.search_knowledge_base, {
      query: "cache",
    })

    expect(out.total).toBe(12)
    expect(out.hits).toHaveLength(12)
    expect(out.hits[0]?.rank).toBe(1)
    expect(out.hits[0]?.title).toBeString()
    expect(out.hits[0]?.url).toMatch(/^https:\/\/kb\./)
    expect(out.hits[0]?.snippet).toBeString()
  })


  test("search_knowledge_base is deterministic", async () => {
    const a = await execToolTest(verboseTools.search_knowledge_base, {
      query: "x",
    })
    const b = await execToolTest(verboseTools.search_knowledge_base, {
      query: "x",
    })

    expect(a).toEqual(b)
  })


  test("fetch_document returns metadata + body", async () => {
    const out = await execToolTest(verboseTools.fetch_document, {
      url: "https://kb.example.com/doc/42",
    })

    expect(out.title).toBeString()
    expect(out.author).toBeString()
    expect(out.body.length).toBeGreaterThan(100)
    expect(out.sections).toHaveLength(6)
  })


  test("list_recent_changes returns 20 ordered entries", async () => {
    const out = await execToolTest(verboseTools.list_recent_changes, {})

    expect(out.total).toBe(20)
    expect(out.changes).toHaveLength(20)
    expect(out.changes[0]?.id).toBe("chg_1000")
  })


  test("testTools is the same object as verboseTools (backwards-compat alias)", () => {
    expect(testTools).toBe(verboseTools)
  })
})
