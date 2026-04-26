"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import {
  answers,
  documentInstances,
  projects,
  sections,
  type JudgeFeedback,
} from "@/lib/db/schema"
import { callJudge } from "@/lib/llm/calls/judge"
import type { JudgeOutput } from "@/lib/llm/schemas"
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
      projectId: documentInstances.projectId,
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

export type SubmitFeedback = JudgeFeedback & { score: 1 | 2 | 3 | 4 | 5 }

type SubmitResult = Result<{
  sectionComplete: boolean
  questionComplete: boolean
  isSoftWarned: boolean
  judge: SubmitFeedback
}>

function feedbackFor(score: number, output: JudgeOutput): SubmitFeedback {
  return {
    score: score as 1 | 2 | 3 | 4 | 5,
    strengths: output.strengths,
    weaknesses: output.weaknesses,
    suggestions: output.suggestions,
    oneLineVerdict: output.one_line_verdict,
  }
}

/**
 * Submit pipeline for an answer:
 *   rule-check → adequacy judge → write rawText + adequacy_score +
 *   judge_feedback → recompute section.status.
 *
 * A question counts as "complete" when adequacy_score >= 3. A section is
 * "complete" when every question is complete. Score 3 is complete-with-
 * soft-warning; score <= 2 keeps the question incomplete (the user has
 * to revise — coach loop ships in P5.3).
 *
 * If the judge call fails (rate-limited / over-budget / provider error)
 * the rawText is NOT written. The user's draft is still preserved by the
 * debounced auto-save.
 */
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

  const ruleResult = ruleCheck(parsed.data.rawText, questionDef.rules)
  if (!ruleResult.ok) {
    return { ok: false, error: ruleResult.error }
  }

  const judge = await callJudge(
    {
      doc_type: section.docType,
      section_title: sectionDef.title,
      question_prompt: questionDef.prompt,
      question_rubric: questionDef.rubric,
      question_examples: questionDef.examples,
      user_answer: parsed.data.rawText,
    },
    {
      userId: user.id,
      projectId: section.projectId,
      documentInstanceId: parsed.data.documentId,
    },
  )
  if (!judge.ok) {
    return {
      ok: false,
      error:
        judge.error === "rate_limited"
          ? "Rate limit hit — try again in a few minutes."
          : judge.error === "budget_exceeded"
            ? "Project LLM budget exceeded — bump cost_budget_usd to continue."
            : "Adequacy judge failed; please retry.",
    }
  }

  const score = judge.data.score
  const feedback = feedbackFor(score, judge.data)
  const isSoftWarned = score === 3
  const questionComplete = score >= 3

  await db
    .insert(answers)
    .values({
      sectionId: section.sectionId,
      questionKey: parsed.data.questionKey,
      rawText: parsed.data.rawText,
      draftText: null,
      adequacyScore: score,
      judgeFeedback: feedback,
      isSoftWarned,
      lastJudgedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        rawText: parsed.data.rawText,
        draftText: null,
        adequacyScore: score,
        judgeFeedback: feedback,
        isSoftWarned,
        lastJudgedAt: new Date(),
      },
    })

  // Recompute section status: complete only when every question has
  // a recorded score >= 3.
  const sectionAnswers = await db
    .select({
      questionKey: answers.questionKey,
      adequacyScore: answers.adequacyScore,
      isSoftWarned: answers.isSoftWarned,
    })
    .from(answers)
    .where(eq(answers.sectionId, section.sectionId))

  const completeKeys = new Set(
    sectionAnswers
      .filter((a) => (a.adequacyScore ?? 0) >= 3)
      .map((a) => a.questionKey),
  )
  const allDone = sectionDef.questions.every((q) => completeKeys.has(q.key))
  const sectionHasSoftWarning = sectionAnswers.some((a) => a.isSoftWarned)

  await db
    .update(sections)
    .set({
      status: allDone
        ? "complete"
        : completeKeys.size > 0
          ? "in_progress"
          : "in_progress",
      hasSoftWarnings: sectionHasSoftWarning,
      completedAt: allDone ? new Date() : null,
    })
    .where(eq(sections.id, section.sectionId))

  revalidatePath(`/app/docs/${parsed.data.documentId}/wizard`)
  revalidatePath(`/app/docs/${parsed.data.documentId}`)

  return {
    ok: true,
    data: {
      sectionComplete: allDone,
      questionComplete,
      isSoftWarned,
      judge: feedback,
    },
  }
}
