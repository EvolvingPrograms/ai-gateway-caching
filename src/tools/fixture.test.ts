import { describe, expect, test } from "bun:test"

import {
  AUTHORS,
  KB_TITLES,
  PHRASES,
  authorFor,
  bodyFor,
  hash,
  phrase,
  titleFor,
  urlFor,
} from "./fixture"

describe("hash", () => {
  test("is deterministic for the same input", () => {
    expect(hash("foo")).toBe(hash("foo"))
  })

  test("differs for different inputs (typical case)", () => {
    expect(hash("foo")).not.toBe(hash("bar"))
  })

  test("returns 0 for the empty string", () => {
    expect(hash("")).toBe(0)
  })
})

describe("phrase", () => {
  test("returns a member of PHRASES", () => {
    expect(PHRASES).toContain(phrase("seed", 0))
  })

  test("is deterministic for the same (seed, n)", () => {
    expect(phrase("seed", 3)).toBe(phrase("seed", 3))
  })
})

describe("titleFor", () => {
  test("returns a member of KB_TITLES", () => {
    expect(KB_TITLES).toContain(titleFor("any-seed"))
  })

  test("is stable for a given seed", () => {
    expect(titleFor("doc-1")).toBe(titleFor("doc-1"))
  })
})

describe("authorFor", () => {
  test("returns a member of AUTHORS", () => {
    expect(AUTHORS).toContain(authorFor("any-seed"))
  })
})

describe("urlFor", () => {
  test("produces a URL on the kb.example.com host", () => {
    expect(urlFor("query", 0)).toMatch(/^https:\/\/kb\.example\.com\/doc\/\d+$/)
  })

  test("is stable for the same (query, i)", () => {
    expect(urlFor("query", 5)).toBe(urlFor("query", 5))
  })
})

describe("bodyFor", () => {
  test("produces the requested number of paragraphs", () => {
    const body = bodyFor("seed", 4)

    expect(body.split("\n\n")).toHaveLength(4)
  })

  test("is stable for the same seed and paragraph count", () => {
    expect(bodyFor("seed", 3)).toBe(bodyFor("seed", 3))
  })
})
