"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { answers, documentInstances, projects, sections } from "@/lib/db/schema"
import { loadQuestionBank, type SupportedDocType } from "@/lib/question-bank"
import {
  saveDraftInputSchema,
  submitAnswerInputSchema,
} from "@/lib/validation/answers"
import { ruleCheck } from "@/lib/wizard/rule-check"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function loadOwnedSection(
  documentId: number,
  sectionKey: string,
  userId: string,
) {
  const [row] = await db
    .select({
      sectionId: sections.id,
      sectionStatus: sections.status,
      docType: documentInstances.docType,
    })
    .from(sections)
    .innerJoin(
      documentInstances,
      eq(documentInstances.id, sections.documentInstanceId),
    )
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, documentId),
        eq(sections.sectionKey, sectionKey),
        eq(projects.ownerId, userId),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function saveDraft(input: unknown): Promise<Result<null>> {
  const user = await requireUser()
  const parsed = saveDraftInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const section = await loadOwnedSection(
    parsed.data.documentId,
    parsed.data.sectionKey,
    user.id,
  )
  if (!section) return { ok: false, error: "not_found" }

  await db
    .insert(answers)
    .values({
      sectionId: section.sectionId,
      questionKey: parsed.data.questionKey,
      draftText: parsed.data.draftText,
    })
    .onDuplicateKeyUpdate({
      set: { draftText: parsed.data.draftText },
    })

  return { ok: true, data: null }
}

type SubmitResult = Result<{
  sectionComplete: boolean
}>

export async function submitAnswer(input: unknown): Promise<SubmitResult> {
  const user = await requireUser()
  const parsed = submitAnswerInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const section = await loadOwnedSection(
    parsed.data.documentId,
    parsed.data.sectionKey,
    user.id,
  )
  if (!section) return { ok: false, error: "not_found" }

  const bank = loadQuestionBank(section.docType as SupportedDocType)
  const sectionDef = bank.sections.find((s) => s.key === parsed.data.sectionKey)
  const questionDef = sectionDef?.questions.find(
    (q) => q.key === parsed.data.questionKey,
  )
  if (!sectionDef || !questionDef) {
    return { ok: false, error: "unknown_question" }
  }

  const check = ruleCheck(parsed.data.rawText, questionDef.rules)
  if (!check.ok) {
    return { ok: false, error: check.error }
  }

  await db
    .insert(answers)
    .values({
      sectionId: section.sectionId,
      questionKey: parsed.data.questionKey,
      rawText: parsed.data.rawText,
      draftText: null,
    })
    .onDuplicateKeyUpdate({
      set: {
        rawText: parsed.data.rawText,
        draftText: null,
      },
    })

  // If every question in this section now has rawText, flip section to
  // complete. Otherwise nudge it to in_progress so the rail shows movement.
  const sectionAnswers = await db
    .select({
      questionKey: answers.questionKey,
      rawText: answers.rawText,
    })
    .from(answers)
    .where(eq(answers.sectionId, section.sectionId))

  const answeredKeys = new Set(
    sectionAnswers
      .filter((a) => a.rawText && a.rawText.length > 0)
      .map((a) => a.questionKey),
  )
  const allDone = sectionDef.questions.every((q) => answeredKeys.has(q.key))

  await db
    .update(sections)
    .set({
      status: allDone ? "complete" : "in_progress",
      completedAt: allDone ? new Date() : null,
    })
    .where(eq(sections.id, section.sectionId))

  revalidatePath(`/app/docs/${parsed.data.documentId}/wizard`)
  revalidatePath(`/app/docs/${parsed.data.documentId}`)

  return { ok: true, data: { sectionComplete: allDone } }
}
