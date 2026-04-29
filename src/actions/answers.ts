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
import { callCoach } from "@/lib/llm/calls/coach"
import { callJudge } from "@/lib/llm/calls/judge"
import type { CoachOutput, JudgeOutput } from "@/lib/llm/schemas"
import { loadQuestionBank, type SupportedDocType } from "@/lib/question-bank"
import {
  saveDraftInputSchema,
  submitAnswerInputSchema,
} from "@/lib/validation/answers"
import { isAnswerComplete } from "@/lib/wizard/answer-status"
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

export type SubmitCoach = CoachOutput

type SubmitResult = Result<{
  sectionComplete: boolean
  questionComplete: boolean
  isSoftWarned: boolean
  judge: SubmitFeedback
  coach: SubmitCoach | null
  revisionCount: number
  forcedComplete: boolean
}>

const MAX_COACH_ITERATIONS = 3

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
 *   rule-check → adequacy judge → (coach loop on score <= 2) → write
 *   rawText + adequacy_score + judge_feedback + revision_count → recompute
 *   section.status.
 *
 * Question completion rules:
 *   score >= 4              → complete, no soft-warn
 *   score == 3              → complete, soft-warn
 *   score <= 2, rev < cap   → NOT complete; coach output returned to UI;
 *                              revision_count incremented
 *   score <= 2, rev >= cap  → force complete with soft-warn (per spec
 *                              § 4.3 — after 3 failed coach iterations,
 *                              soft-warn and let the user advance)
 *
 * On coach call failure we still write the answer (the user already saw
 * the score) but the UI gets a null coach output and a hint that the
 * coach was unavailable.
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

  // Read existing revision_count to decide whether to coach or force-advance.
  const [existingAnswer] = await db
    .select({
      revisionCount: answers.revisionCount,
    })
    .from(answers)
    .where(
      and(
        eq(answers.sectionId, section.sectionId),
        eq(answers.questionKey, parsed.data.questionKey),
      ),
    )
    .limit(1)
  const previousRevisions = existingAnswer?.revisionCount ?? 0

  let questionComplete: boolean
  let isSoftWarned: boolean
  let forcedComplete = false
  let coachOutput: CoachOutput | null = null
  let nextRevisionCount = previousRevisions

  if (score >= 4) {
    questionComplete = true
    isSoftWarned = false
  } else if (score === 3) {
    questionComplete = true
    isSoftWarned = true
  } else if (previousRevisions >= MAX_COACH_ITERATIONS) {
    // Already had MAX iterations of coaching; force the user forward.
    questionComplete = true
    isSoftWarned = true
    forcedComplete = true
    nextRevisionCount = previousRevisions + 1
  } else {
    // score <= 2, still under the iteration cap — run the coach.
    nextRevisionCount = previousRevisions + 1
    questionComplete = false
    isSoftWarned = false
    const coach = await callCoach(
      {
        doc_type: section.docType,
        section_title: sectionDef.title,
        question_prompt: questionDef.prompt,
        user_answer: parsed.data.rawText,
        judge_score: score,
        judge_strengths: judge.data.strengths,
        judge_weaknesses: judge.data.weaknesses,
        judge_suggestions: judge.data.suggestions,
        revision_count: nextRevisionCount,
      },
      {
        userId: user.id,
        projectId: section.projectId,
        documentInstanceId: parsed.data.documentId,
      },
    )
    if (coach.ok) coachOutput = coach.data
    // On coach failure (rate_limited / budget / error) we still write the
    // answer + judge feedback below; UI handles a null coach output.
  }

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
      revisionCount: nextRevisionCount,
      lastJudgedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        rawText: parsed.data.rawText,
        draftText: null,
        adequacyScore: score,
        judgeFeedback: feedback,
        isSoftWarned,
        revisionCount: nextRevisionCount,
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
    sectionAnswers.filter(isAnswerComplete).map((a) => a.questionKey),
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
      coach: coachOutput,
      revisionCount: nextRevisionCount,
      forcedComplete,
    },
  }
}
