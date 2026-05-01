import { describe, expect, it } from "vitest"

import { parseMaybeJson } from "@/lib/db"

type FB = { strengths: string[]; oneLineVerdict: string }

describe("parseMaybeJson", () => {
  it("returns null for null/undefined", () => {
    expect(parseMaybeJson(null)).toBeNull()
    expect(parseMaybeJson(undefined)).toBeNull()
  })

  it("parses a JSON string into an object (the mysql2-prepared-stmt path)", () => {
    const raw = '{"strengths":["a","b"],"oneLineVerdict":"ok"}'
    const out = parseMaybeJson<FB>(raw)
    expect(out?.strengths).toEqual(["a", "b"])
    expect(out?.oneLineVerdict).toBe("ok")
  })

  it("passes through an already-parsed object", () => {
    const obj: FB = { strengths: ["x"], oneLineVerdict: "y" }
    const out = parseMaybeJson<FB>(obj)
    expect(out).toBe(obj)
  })

  it("returns null on malformed JSON instead of throwing", () => {
    expect(parseMaybeJson("not json{{")).toBeNull()
  })

  it("parses arrays and primitives wrapped in JSON", () => {
    expect(parseMaybeJson<number[]>("[1,2,3]")).toEqual([1, 2, 3])
    expect(parseMaybeJson<string>('"hello"')).toBe("hello")
  })
})
