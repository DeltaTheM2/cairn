import { describe, expect, it } from "vitest"

import { extractJson } from "@/lib/llm/extract-json"

describe("extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })

  it("parses raw JSON with surrounding whitespace", () => {
    expect(extractJson('  \n  {"a":1}  \n')).toEqual({ a: 1 })
  })

  it("strips ```json ... ``` fences (the actual production failure)", () => {
    const raw = '```json\n{"score":5,"strengths":["x"]}\n```'
    expect(extractJson(raw)).toEqual({ score: 5, strengths: ["x"] })
  })

  it("strips bare ``` ... ``` fences without a json tag", () => {
    const raw = '```\n{"a":1}\n```'
    expect(extractJson(raw)).toEqual({ a: 1 })
  })

  it("recovers from a one-line preamble before raw JSON", () => {
    const raw = 'Here is the verdict:\n{"score":3,"weaknesses":[]}'
    expect(extractJson(raw)).toEqual({ score: 3, weaknesses: [] })
  })

  it("recovers from a preamble before a fenced block", () => {
    const raw = 'Here you go:\n```json\n{"k":"v"}\n```'
    expect(extractJson(raw)).toEqual({ k: "v" })
  })

  it("parses arrays", () => {
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3])
  })

  it("throws the original parse error on truly malformed input", () => {
    expect(() => extractJson("not json at all {")).toThrow()
  })
})
