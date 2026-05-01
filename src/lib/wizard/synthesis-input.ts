import type { SynthesizeInput } from "@/lib/llm/schemas"
import type { QuestionBank } from "@/lib/validation/question-bank"

export type SynthesisAnswer = {
  sectionKey: string
  questionKey: string
  rawText: string
  isSoftWarned: boolean
  adequacyScore: number | null
}

export type SynthesisSectionRow = {
  key: string
  status: "pending" | "in_progress" | "complete"
}

export function allSectionsComplete(rows: SynthesisSectionRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.status === "complete")
}

/**
 * Renders sections_and_answers + soft_warned_summary in the exact format
 * the synthesizer prompt expects (see prompts/synthesizer.md user template).
 * Missing answers become "(not answered)" — the prompt has explicit
 * fallback rendering for unaddressed sections.
 */
export function buildSynthesizeInput(args: {
  docName: string
  docType: string
  timestampIso: string
  bank: QuestionBank
  answers: SynthesisAnswer[]
}): SynthesizeInput {
  const { docName, docType, timestampIso, bank, answers } = args

  const byKey = new Map<string, SynthesisAnswer>()
  for (const a of answers) {
    byKey.set(`${a.sectionKey}::${a.questionKey}`, a)
  }

  const sectionsAndAnswers = bank.sections
    .map((sec) => {
      const lines: string[] = [`SECTION: ${sec.title}`]
      for (const q of sec.questions) {
        const ans = byKey.get(`${sec.key}::${q.key}`)
        const tag = ans?.isSoftWarned ? "    [SOFT-WARNED]" : ""
        lines.push(`  Q: ${q.prompt}`)
        lines.push(`  A: ${ans?.rawText?.trim() || "(not answered)"}${tag}`)
      }
      return lines.join("\n")
    })
    .join("\n\n")

  const softWarned = answers.filter((a) => a.isSoftWarned)
  const softWarnedSummary = softWarned.length
    ? softWarned
        .map((a) => {
          const sec = bank.sections.find((s) => s.key === a.sectionKey)
          const q = sec?.questions.find((qq) => qq.key === a.questionKey)
          const sectionTitle = sec?.title ?? a.sectionKey
          const questionPrompt = q?.prompt ?? a.questionKey
          return `- [${sectionTitle}] ${questionPrompt} (score ${a.adequacyScore ?? "?"})`
        })
        .join("\n")
    : "(none)"

  return {
    doc_type: docType,
    doc_name: docName,
    timestamp_iso: timestampIso,
    synthesis_template: bank.synthesis_template ?? "",
    sections_and_answers: sectionsAndAnswers,
    soft_warned_summary: softWarnedSummary,
  }
}
