import { describe, expect, it } from "vitest"

import { ruleCheck } from "@/lib/wizard/rule-check"

describe("ruleCheck", () => {
  it("passes when no rules", () => {
    expect(ruleCheck("anything", {})).toEqual({ ok: true })
  })

  describe("min_length", () => {
    it("fails when trimmed length < min", () => {
      const r = ruleCheck("   ab   ", { min_length: 5 })
      expect(r.ok).toBe(false)
    })
    it("passes when trimmed length >= min", () => {
      expect(ruleCheck("abcdef", { min_length: 5 })).toEqual({ ok: true })
    })
  })

  describe("max_length", () => {
    it("fails when length > max", () => {
      expect(ruleCheck("abcdef", { max_length: 5 }).ok).toBe(false)
    })
    it("passes when length <= max", () => {
      expect(ruleCheck("abcd", { max_length: 5 })).toEqual({ ok: true })
    })
  })

  describe("must_contain_any", () => {
    it("fails when none of the terms appear", () => {
      const r = ruleCheck("xyz only", { must_contain_any: ["user", "team"] })
      expect(r.ok).toBe(false)
    })
    it("passes when at least one term appears (case-insensitive)", () => {
      expect(
        ruleCheck("we serve our USERS daily", {
          must_contain_any: ["user", "customer"],
        }),
      ).toEqual({ ok: true })
    })
  })

  describe("must_contain_all", () => {
    it("fails when any required term is missing", () => {
      const r = ruleCheck("only user, no team", {
        must_contain_all: ["user", "team", "deadline"],
      })
      expect(r.ok).toBe(false)
    })
    it("passes when all terms appear", () => {
      expect(
        ruleCheck("user team deadline", {
          must_contain_all: ["user", "team", "deadline"],
        }),
      ).toEqual({ ok: true })
    })
  })

  describe("regex", () => {
    it("fails when value doesn't match", () => {
      expect(ruleCheck("abc", { regex: "^[0-9]+$" }).ok).toBe(false)
    })
    it("passes when value matches", () => {
      expect(ruleCheck("12345", { regex: "^[0-9]+$" })).toEqual({ ok: true })
    })
    it("returns a clear error if the regex itself is malformed", () => {
      const r = ruleCheck("anything", { regex: "(" })
      expect(r.ok).toBe(false)
    })
  })

  it("composes rules in the listed order — min_length fires first", () => {
    const r = ruleCheck("xx", {
      min_length: 5,
      must_contain_any: ["nope"],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/At least 5 characters/i)
  })
})
