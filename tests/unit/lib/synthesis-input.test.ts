import { describe, expect, it } from "vitest"

import type { QuestionBank } from "@/lib/validation/question-bank"
import {
  allSectionsComplete,
  buildSynthesizeInput,
} from "@/lib/wizard/synthesis-input"

const bank: QuestionBank = {
  doc_type: "prd",
  version: "1",
  title: "PRD",
  sections: [
    {
      key: "vision",
      title: "Vision",
      description: "v",
      questions: [
        {
          key: "problem",
          prompt: "What problem?",
          rules: {},
          rubric: "r",
          examples: [],
        },
        {
          key: "why",
          prompt: "Why now?",
          rules: {},
          rubric: "r",
          examples: [],
        },
      ],
    },
    {
      key: "users",
      title: "Users",
      description: "u",
      questions: [
        {
          key: "primary",
          prompt: "Primary user?",
          rules: {},
          rubric: "r",
          examples: [],
        },
      ],
    },
  ],
  synthesis_template: "TEMPLATE_HERE",
}

describe("allSectionsComplete", () => {
  it("returns false on empty input", () => {
    expect(allSectionsComplete([])).toBe(false)
  })
  it("returns false if any section is not complete", () => {
    expect(
      allSectionsComplete([
        { key: "a", status: "complete" },
        { key: "b", status: "in_progress" },
      ]),
    ).toBe(false)
  })
  it("returns true when every section is complete", () => {
    expect(
      allSectionsComplete([
        { key: "a", status: "complete" },
        { key: "b", status: "complete" },
      ]),
    ).toBe(true)
  })
})

describe("buildSynthesizeInput", () => {
  const baseAnswers = [
    {
      sectionKey: "vision",
      questionKey: "problem",
      rawText: "Engineers waste hours.",
      isSoftWarned: false,
      adequacyScore: 5,
    },
    {
      sectionKey: "vision",
      questionKey: "why",
      rawText: "LLMs are good now.",
      isSoftWarned: true,
      adequacyScore: 2,
    },
    {
      sectionKey: "users",
      questionKey: "primary",
      rawText: "Mid-level engineers.",
      isSoftWarned: false,
      adequacyScore: 4,
    },
  ]

  it("renders every bank section even when answers are missing", () => {
    const input = buildSynthesizeInput({
      docName: "MyDoc",
      docType: "prd",
      timestampIso: "2026-04-28T12:00:00Z",
      bank,
      answers: [],
    })
    expect(input.sections_and_answers).toContain("SECTION: Vision")
    expect(input.sections_and_answers).toContain("SECTION: Users")
    expect(input.sections_and_answers).toContain("(not answered)")
  })

  it("tags soft-warned answers and lists them in the summary", () => {
    const input = buildSynthesizeInput({
      docName: "MyDoc",
      docType: "prd",
      timestampIso: "2026-04-28T12:00:00Z",
      bank,
      answers: baseAnswers,
    })
    expect(input.sections_and_answers).toContain(
      "A: LLMs are good now.    [SOFT-WARNED]",
    )
    expect(input.sections_and_answers).toContain("A: Engineers waste hours.")
    expect(input.soft_warned_summary).toContain("Why now?")
    expect(input.soft_warned_summary).not.toContain("What problem?")
    expect(input.soft_warned_summary).toContain("score 2")
  })

  it("emits '(none)' when there are no soft-warned answers", () => {
    const input = buildSynthesizeInput({
      docName: "MyDoc",
      docType: "prd",
      timestampIso: "2026-04-28T12:00:00Z",
      bank,
      answers: baseAnswers.filter((a) => !a.isSoftWarned),
    })
    expect(input.soft_warned_summary).toBe("(none)")
  })

  it("passes through doc metadata and template verbatim", () => {
    const input = buildSynthesizeInput({
      docName: "MyDoc",
      docType: "prd",
      timestampIso: "2026-04-28T12:00:00Z",
      bank,
      answers: baseAnswers,
    })
    expect(input.doc_name).toBe("MyDoc")
    expect(input.doc_type).toBe("prd")
    expect(input.timestamp_iso).toBe("2026-04-28T12:00:00Z")
    expect(input.synthesis_template).toBe("TEMPLATE_HERE")
  })
})
