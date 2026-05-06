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
  question_criteria: [
    {
      key: "names_affected_group",
      label: "Names a concrete affected group",
      hint: "Specific role / team / persona — not 'users'",
    },
    {
      key: "specific_pain_point",
      label: "Describes a specific pain point with an example",
      hint: "Concrete example of what's broken today",
    },
  ],
  question_examples: ["good 1", "good 2"],
  user_answer: "",
}

describe("MockProvider.judge", () => {
  const provider = new MockProvider()

  it("returns score 1 + every criterion unmet for empty/short answers", async () => {
    const r = await provider.judge({
      ...baseJudgeInput,
      user_answer: "tbd",
    })
    expect(r.data.score).toBe(1)
    expect(r.data.criteria.every((c) => !c.met)).toBe(true)
    expect(judgeOutputSchema.safeParse(r.data).success).toBe(true)
  })

  it("output validates the judgeOutputSchema for long answers", async () => {
    const long =
      "Mid-market sales managers (10-50 person teams) currently move leads through a Slack channel; we replace the channel with a structured pipeline view. " +
      "Concrete example: when a deal stalls, the manager has no record of which step it stalled at, so handover takes hours."
    const r = await provider.judge({
      ...baseJudgeInput,
      user_answer: long,
    })
    expect(judgeOutputSchema.safeParse(r.data).success).toBe(true)
    expect(r.data.criteria.length).toBe(baseJudgeInput.question_criteria.length)
  })
})

describe("MockProvider.coach", () => {
  it("returns one targeted question per failed criterion with criterion_key", async () => {
    const provider = new MockProvider()
    const failed = [
      {
        key: "names_affected_group",
        label: "Names a concrete affected group",
        hint: "Specific role / team / persona",
        why_not: "Generic 'users'",
      },
      {
        key: "specific_pain_point",
        label: "Describes a specific pain point with an example",
        hint: "Concrete example",
        why_not: "No example given",
      },
    ]
    const r = await provider.coach({
      doc_type: "prd",
      section_title: "Vision & Problem",
      question_prompt: "What problem are we solving?",
      user_answer: "stuff",
      failed_criteria: failed,
      revision_count: 1,
    })
    expect(coachOutputSchema.safeParse(r.data).success).toBe(true)
    expect(r.data.targeted_questions.length).toBe(failed.length)
    const keys = r.data.targeted_questions.map((q) => q.criterion_key)
    for (const f of failed) expect(keys).toContain(f.key)
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
