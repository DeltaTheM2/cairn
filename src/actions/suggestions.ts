"use server"

import { and, eq, inArray, isNull } from "drizzle-orm"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { answers, documentInstances, projects, sections } from "@/lib/db/schema"
import { callSuggest } from "@/lib/llm/calls/suggester"
import type { SuggestOutput } from "@/lib/llm/schemas"
import { loadQuestionBank, type SupportedDocType } from "@/lib/question-bank"
import { suggestForSectionInputSchema } from "@/lib/validation/suggestions"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * "Suggest things I'm missing" for a section. Loads the section's
 * answers + project context (other completed sections), formats both
 * per the suggester prompt's user template, calls the wrapper.
 *
 * Output is NOT persisted in this iteration — schema's
 * answers.llm_suggestions is per-answer but the data is per-section,
 * which needs a schema decision. Surfaced separately.
 */
export async function suggestForSection(
  input: unknown,
): Promise<Result<SuggestOutput>> {
  const user = await requireUser()
  const parsed = suggestForSectionInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const [doc] = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
      docType: documentInstances.docType,
      projectId: documentInstances.projectId,
    })
    .from(documentInstances)
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, parsed.data.documentId),
        eq(projects.ownerId, user.id),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  if (!doc) return { ok: false, error: "not_found" }

  const bank = loadQuestionBank(doc.docType as SupportedDocType)
  const sectionDef = bank.sections.find((s) => s.key === parsed.data.sectionKey)
  if (!sectionDef) return { ok: false, error: "unknown_section" }

  const sectionRows = await db
    .select({
      id: sections.id,
      sectionKey: sections.sectionKey,
      status: sections.status,
    })
    .from(sections)
    .where(eq(sections.documentInstanceId, doc.id))
  const currentSectionRow = sectionRows.find(
    (r) => r.sectionKey === parsed.data.sectionKey,
  )
  if (!currentSectionRow) return { ok: false, error: "unknown_section" }

  const sectionIds = sectionRows.map((s) => s.id)
  const answerRows = sectionIds.length
    ? await db
        .select({
          sectionId: answers.sectionId,
          questionKey: answers.questionKey,
          rawText: answers.rawText,
        })
        .from(answers)
        .where(inArray(answers.sectionId, sectionIds))
    : []

  const keyById = new Map(sectionRows.map((s) => [s.id, s.sectionKey]))
  const answersBySection = new Map<string, Map<string, string>>()
  for (const a of answerRows) {
    const key = keyById.get(a.sectionId)
    if (!key) continue
    if (!answersBySection.has(key)) answersBySection.set(key, new Map())
    answersBySection.get(key)!.set(a.questionKey, a.rawText ?? "")
  }

  const sectionAnswersText = sectionDef.questions
    .map((q) => {
      const ans = answersBySection.get(parsed.data.sectionKey)?.get(q.key) ?? ""
      return `Q: ${q.prompt}\nA: ${ans.trim() || "(not yet answered)"}`
    })
    .join("\n\n")

  // Project context: other sections that have at least one answer. Skip
  // pending sections entirely so the suggester isn't padding context with
  // "(not yet answered)" noise.
  const otherSections = bank.sections.filter(
    (s) => s.key !== parsed.data.sectionKey,
  )
  const projectContextText =
    otherSections
      .map((s) => {
        const sectionRow = sectionRows.find((r) => r.sectionKey === s.key)
        if (!sectionRow) return null
        const ansMap = answersBySection.get(s.key)
        if (!ansMap || ansMap.size === 0) return null
        const lines = [`SECTION: ${s.title}`]
        for (const q of s.questions) {
          const ans = ansMap.get(q.key)
          if (!ans?.trim()) continue
          lines.push(`  Q: ${q.prompt}`)
          lines.push(`  A: ${ans.trim()}`)
        }
        return lines.length > 1 ? lines.join("\n") : null
      })
      .filter((v): v is string => v !== null)
      .join("\n\n") || "(no other sections answered yet)"

  const result = await callSuggest(
    {
      doc_type: doc.docType,
      doc_name: doc.name,
      section_title: sectionDef.title,
      section_description: sectionDef.description,
      section_answers: sectionAnswersText,
      project_context: projectContextText,
    },
    {
      userId: user.id,
      projectId: doc.projectId,
      documentInstanceId: doc.id,
    },
  )

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "rate_limited"
          ? "Rate limit hit — try again in a few minutes."
          : result.error === "budget_exceeded"
            ? "Project LLM budget exceeded — bump cost_budget_usd to continue."
            : "Suggester failed; please retry.",
    }
  }

  return { ok: true, data: result.data }
}
