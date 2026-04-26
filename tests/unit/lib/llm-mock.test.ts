import { describe, expect, it } from "vitest"

import { MockProvider } from "@/lib/llm/mock"
import {
  coachOutputSchema,
  judgeOutputSchema,
  suggesterOutputSchema,
} from "@/lib/llm/schemas"

const baseJudgeInput = {
  doc_type: "prd",
  section_title: "Vision & Problem",
  question_prompt: "What problem are we solving?",
  question_rubric: "...",
  question_examples: ["good 1", "good 2"],
  user_answer: "",
}

describe("MockProvider.judge", () => {
  const provider = new MockProvider()

  it("returns score 1 for empty / very short answers", async () => {
    const r = await provider.judge({
      ...baseJudgeInput,
      user_answer: "tbd",
    })
    expect(r.data.score).toBe(1)
    expect(judgeOutputSchema.safeParse(r.data).success).toBe(true)
  })

  it("returns score 5 for long, substantive answers", async () => {
    const long = "x".repeat(400)
    const r = await provider.judge({
      ...baseJudgeInput,
      user_answer: long,
    })
    expect(r.data.score).toBe(5)
    expect(r.data.strengths.length).toBeGreaterThan(0)
  })

  it("returns score 3 for mid-length answers", async () => {
    const mid = "x".repeat(100)
    const r = await provider.judge({
      ...baseJudgeInput,
      user_answer: mid,
    })
    expect(r.data.score).toBe(3)
  })
})

describe("MockProvider.coach", () => {
  it("returns a coach output that matches the schema", async () => {
    const provider = new MockProvider()
    const r = await provider.coach({
      doc_type: "prd",
      section_title: "Vision & Problem",
      question_prompt: "What problem are we solving?",
      user_answer: "stuff",
      judge_score: 2,
      judge_strengths: [],
      judge_weaknesses: ["too vague"],
      judge_suggestions: ["be specific"],
      revision_count: 1,
    })
    expect(coachOutputSchema.safeParse(r.data).success).toBe(true)
    expect(r.data.examples.length).toBeGreaterThanOrEqual(2)
  })
})

describe("MockProvider.suggest", () => {
  it("returns a suggester output that matches the schema", async () => {
    const provider = new MockProvider()
    const r = await provider.suggest({
      doc_type: "prd",
      doc_name: "Cairn PRD",
      section_title: "Functional",
      section_description: "What the system must do.",
      section_answers: "FR-1: ...\nFR-2: ...",
      project_context: "Internal documentation tool",
    })
    expect(suggesterOutputSchema.safeParse(r.data).success).toBe(true)
  })
})

describe("MockProvider.synthesize", () => {
  it("streams chunks and ends with a done event carrying full text", async () => {
    const provider = new MockProvider()
    const chunks: string[] = []
    let done: { fullText: string; model: string } | null = null
    for await (const ev of provider.synthesize({
      doc_type: "prd",
      doc_name: "Test PRD",
      timestamp_iso: "2026-04-25T00:00:00Z",
      synthesis_template: "...",
      sections_and_answers: "...",
      soft_warned_summary: "",
    })) {
      if (ev.type === "delta") chunks.push(ev.text)
      else done = { fullText: ev.fullText, model: ev.model }
    }
    expect(chunks.length).toBeGreaterThan(0)
    expect(done).not.toBeNull()
    expect(done!.fullText).toContain("Test PRD")
    expect(done!.model).toContain("mock")
  })
})
