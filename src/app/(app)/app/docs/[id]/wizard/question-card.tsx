"use client"

import * as React from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  X,
  XCircle,
} from "lucide-react"

import { mergeAnswer, saveDraft, submitAnswer } from "@/actions/answers"
import type { AnswerFeedback } from "@/app/(app)/app/docs/[id]/wizard/wizard-shell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { CoachOutput } from "@/lib/llm/schemas"
import { cn } from "@/lib/utils"
import type { Question } from "@/lib/validation/question-bank"
import { isAnswerComplete } from "@/lib/wizard/answer-status"

type SaveState = "idle" | "saving" | "saved" | "error"

type Props = {
  documentId: number
  sectionKey: string
  question: Question
  initialDraft: string
  initialRawText: string
  initialScore: number | null
  initialFeedback: AnswerFeedback | null
  initialSoftWarned: boolean
  onAnswerSubmitted: (opts: {
    sectionKey: string
    questionKey: string
    rawText: string
    sectionComplete: boolean
    questionComplete: boolean
    isSoftWarned: boolean
    score: number
    feedback: AnswerFeedback
  }) => void
  onDraftSaved: (opts: {
    sectionKey: string
    questionKey: string
    draftText: string
  }) => void
}

const MAX_COACH_ITERATIONS = 3

const DEBOUNCE_MS = 800

const SCORE_LABELS: Record<number, string> = {
  1: "Inadequate",
  2: "Weak",
  3: "Borderline",
  4: "Good",
  5: "Excellent",
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 4
      ? "bg-foreground/10 text-foreground border-foreground/30"
      : score === 3
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-destructive/40 bg-destructive/10 text-destructive"
  const Icon = score >= 4 ? CheckCircle2 : score === 3 ? AlertTriangle : XCircle
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {score} · {SCORE_LABELS[score] ?? ""}
    </span>
  )
}

export function QuestionCard({
  documentId,
  sectionKey,
  question,
  initialDraft,
  initialRawText,
  initialScore,
  initialFeedback,
  initialSoftWarned,
  onAnswerSubmitted,
  onDraftSaved,
}: Props) {
  const initial = initialDraft || initialRawText || ""
  const [text, setText] = React.useState(initial)
  const [submittedText, setSubmittedText] = React.useState(initialRawText)
  const [score, setScore] = React.useState<number | null>(initialScore)
  const [feedback, setFeedback] = React.useState<AnswerFeedback | null>(
    initialFeedback,
  )
  const [isSoftWarned, setIsSoftWarned] = React.useState(initialSoftWarned)
  const [saveState, setSaveState] = React.useState<SaveState>("idle")
  const [submitState, setSubmitState] = React.useState<"idle" | "submitting">(
    "idle",
  )
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [examplesOpen, setExamplesOpen] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(true)
  const [coach, setCoach] = React.useState<CoachOutput | null>(null)
  const [revisionCount, setRevisionCount] = React.useState(0)
  const [forcedComplete, setForcedComplete] = React.useState(false)
  const [mergeState, setMergeState] = React.useState<"idle" | "merging">("idle")
  const [mergeError, setMergeError] = React.useState<string | null>(null)
  const [mergeSummary, setMergeSummary] = React.useState<string | null>(null)

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = React.useRef(initialDraft)

  const isSubmitted = submittedText.length > 0 && submittedText === text
  const isDirty = text.length > 0 && text !== submittedText
  const questionComplete =
    isSubmitted && isAnswerComplete({ adequacyScore: score, isSoftWarned })

  const criteriaByKey = React.useMemo(() => {
    const m = new Map<string, CriterionDef>()
    for (const c of question.criteria) m.set(c.key, c)
    return m
  }, [question.criteria])

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function scheduleAutoSave(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (value === lastSavedRef.current) return
      if (value === submittedText) return
      setSaveState("saving")
      const result = await saveDraft({
        documentId,
        sectionKey,
        questionKey: question.key,
        draftText: value,
      })
      if (result.ok) {
        lastSavedRef.current = value
        setSaveState("saved")
        onDraftSaved({
          sectionKey,
          questionKey: question.key,
          draftText: value,
        })
      } else {
        setSaveState("error")
      }
    }, DEBOUNCE_MS)
  }

  function onChange(value: string) {
    setText(value)
    setSubmitError(null)
    if (saveState !== "saving") setSaveState("idle")
    scheduleAutoSave(value)
  }

  async function onSubmit() {
    if (!isDirty || submitState === "submitting") return
    setSubmitError(null)
    setSubmitState("submitting")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const result = await submitAnswer({
      documentId,
      sectionKey,
      questionKey: question.key,
      rawText: text,
    })
    setSubmitState("idle")
    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSubmittedText(text)
    setSaveState("saved")
    setScore(result.data.judge.score)
    setFeedback(result.data.judge)
    setIsSoftWarned(result.data.isSoftWarned)
    setFeedbackOpen(true)
    setCoach(result.data.coach)
    setRevisionCount(result.data.revisionCount)
    setForcedComplete(result.data.forcedComplete)
    lastSavedRef.current = ""
    onAnswerSubmitted({
      sectionKey,
      questionKey: question.key,
      rawText: text,
      sectionComplete: result.data.sectionComplete,
      questionComplete: result.data.questionComplete,
      isSoftWarned: result.data.isSoftWarned,
      score: result.data.judge.score,
      feedback: result.data.judge,
    })
  }

  async function applyMerge(
    qaPairs: Array<{
      criterion_key: string
      criterion_label: string
      question: string
      answer: string
    }>,
  ) {
    if (mergeState === "merging") return
    setMergeError(null)
    setMergeSummary(null)
    setMergeState("merging")
    const result = await mergeAnswer({
      documentId,
      sectionKey,
      questionKey: question.key,
      originalDraft: text,
      qaPairs,
    })
    setMergeState("idle")
    if (!result.ok) {
      setMergeError(result.error)
      return
    }
    // Replace the textarea content with the merged draft. The user can
    // edit further before submitting; submit re-runs the judge.
    setText(result.data.revised_draft)
    setMergeSummary(result.data.change_summary)
    setSubmittedText("")
    setSaveState("idle")
    // Clear coach so the form collapses; the next failing submit (if
    // any) will produce a fresh coach call with new targeted questions.
    setCoach(null)
    lastSavedRef.current = ""
    onDraftSaved({
      sectionKey,
      questionKey: question.key,
      draftText: result.data.revised_draft,
    })
  }

  const minLen = question.rules.min_length
  const maxLen = question.rules.max_length
  const trimmedLen = text.trim().length

  return (
    <article
      className={cn(
        "border-border flex flex-col gap-3 rounded-lg border p-4",
        questionComplete && !isSoftWarned && "border-foreground/30",
        isSoftWarned && "border-amber-500/40",
        score !== null && score < 3 && "border-destructive/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground text-sm font-medium">{question.prompt}</p>
        {isSubmitted && score !== null ? <ScoreBadge score={score} /> : null}
      </div>

      {question.examples.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setExamplesOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            aria-expanded={examplesOpen}
          >
            {examplesOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {examplesOpen ? "Hide" : "Show"} {question.examples.length} example
            {question.examples.length === 1 ? "" : "s"}
          </button>
          {examplesOpen ? (
            <ul className="text-muted-foreground mt-2 flex flex-col gap-2 text-xs">
              {question.examples.map((ex, i) => (
                <li
                  key={i}
                  className="border-border bg-muted/30 rounded-md border p-2"
                >
                  {ex}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => scheduleAutoSave(text)}
        placeholder={minLen ? `At least ${minLen} characters…` : "Your answer…"}
        rows={6}
        aria-invalid={submitError ? true : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-muted-foreground flex items-center gap-3">
          <span>
            {trimmedLen}
            {minLen ? ` / ${minLen}` : ""}
            {maxLen ? ` (max ${maxLen})` : ""}
          </span>
          {saveState === "saving" ? <span>Saving…</span> : null}
          {saveState === "saved" && !isSubmitted ? (
            <span>Draft saved</span>
          ) : null}
          {saveState === "error" ? (
            <span className="text-destructive">Save failed</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {submitError ? (
            <span className="text-destructive">{submitError}</span>
          ) : null}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!isDirty || submitState === "submitting"}
          >
            {submitState === "submitting"
              ? "Judging…"
              : isSubmitted
                ? "Resubmit"
                : "Submit"}
          </Button>
        </div>
      </div>

      <CriteriaChecklist
        criteria={question.criteria}
        verdicts={feedback?.criteria ?? null}
        oneLineVerdict={feedback?.oneLineVerdict}
        open={feedbackOpen}
        onToggle={() => setFeedbackOpen((o) => !o)}
      />

      {mergeSummary ? (
        <p className="text-muted-foreground text-xs">
          ✨ Revised — {mergeSummary} Review and submit.
        </p>
      ) : null}

      {coach && !questionComplete ? (
        <CoachPanel
          key={revisionCount}
          coach={coach}
          revisionCount={revisionCount}
          maxIterations={MAX_COACH_ITERATIONS}
          onApply={applyMerge}
          merging={mergeState === "merging"}
          mergeError={mergeError}
          criteriaByKey={criteriaByKey}
        />
      ) : null}

      {forcedComplete ? (
        <p className="text-muted-foreground text-xs">
          Soft-warned and advanced — coach hit the {MAX_COACH_ITERATIONS}-
          iteration cap. The synthesized doc will note this answer is
          uncertain.
        </p>
      ) : null}
    </article>
  )
}

type CriterionDef = {
  key: string
  label: string
  hint: string
}

type CriterionVerdict = {
  key: string
  met: boolean
  why_not?: string
}

function CriteriaChecklist({
  criteria,
  verdicts,
  oneLineVerdict,
  open,
  onToggle,
}: {
  criteria: ReadonlyArray<CriterionDef>
  verdicts: ReadonlyArray<CriterionVerdict> | null
  oneLineVerdict: string | undefined
  open: boolean
  onToggle: () => void
}) {
  if (criteria.length === 0) return null
  const verdictByKey = new Map<string, CriterionVerdict>()
  if (verdicts) for (const v of verdicts) verdictByKey.set(v.key, v)
  const judged = verdicts !== null
  const allMet = judged && criteria.every((c) => verdictByKey.get(c.key)?.met)

  const tone = !judged
    ? "border-border bg-muted/30"
    : allMet
      ? "border-foreground/20 bg-muted/40"
      : "border-amber-500/30 bg-amber-500/5"

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border p-3", tone)}>
      <button
        type="button"
        onClick={onToggle}
        className="text-foreground inline-flex items-center gap-1 text-xs font-medium"
        aria-expanded={open}
      >
        {open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {judged
          ? `What a strong answer needs · ${criteria.filter((c) => verdictByKey.get(c.key)?.met).length}/${criteria.length} met`
          : "What a strong answer needs"}
      </button>
      {judged && oneLineVerdict ? (
        <p className="text-foreground text-sm">{oneLineVerdict}</p>
      ) : null}
      {open ? (
        <ul className="mt-1 flex flex-col gap-2">
          {criteria.map((c) => {
            const v = verdictByKey.get(c.key)
            const Icon = !v ? Circle : v.met ? Check : X
            const iconTone = !v
              ? "text-muted-foreground"
              : v.met
                ? "text-foreground"
                : "text-amber-700 dark:text-amber-400"
            return (
              <li key={c.key} className="flex items-start gap-2">
                <Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", iconTone)}
                  aria-hidden
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground text-xs font-medium">
                    {c.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {c.hint}
                  </span>
                  {v && !v.met && v.why_not ? (
                    <span className="text-amber-700 dark:text-amber-400 mt-0.5 text-xs italic">
                      Judge: {v.why_not}
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function CoachPanel({
  coach,
  revisionCount,
  maxIterations,
  onApply,
  merging,
  mergeError,
  criteriaByKey,
}: {
  coach: CoachOutput
  revisionCount: number
  maxIterations: number
  onApply: (
    qaPairs: Array<{
      criterion_key: string
      criterion_label: string
      question: string
      answer: string
    }>,
  ) => Promise<void>
  merging: boolean
  mergeError: string | null
  criteriaByKey: Map<string, CriterionDef>
}) {
  // No reset effect needed — the parent gives us a key based on
  // revisionCount, so when coach swaps the whole component remounts
  // and the initial state below is recomputed.
  const [answers, setAnswers] = React.useState<string[]>(() =>
    coach.targeted_questions.map(() => ""),
  )
  const [examplesOpen, setExamplesOpen] = React.useState(false)

  const filledCount = answers.filter((a) => a.trim().length > 0).length

  function setAnswerAt(index: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  async function onRevise() {
    if (filledCount === 0 || merging) return
    const qaPairs = coach.targeted_questions.map((tq, i) => {
      const def = criteriaByKey.get(tq.criterion_key)
      return {
        criterion_key: tq.criterion_key,
        criterion_label: def?.label ?? tq.criterion_key,
        question: tq.question,
        answer: answers[i] ?? "",
      }
    })
    await onApply(qaPairs)
  }

  return (
    <div className="border-foreground/20 bg-muted/40 flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-foreground text-xs font-medium">
          Coach · attempt {revisionCount} of {maxIterations}
        </div>
        {coach.encouragement ? (
          <div className="text-muted-foreground text-xs italic">
            {coach.encouragement}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-xs uppercase tracking-wider">
          Fill in the missing details
        </div>
        <p className="text-muted-foreground text-xs">
          Answer any (or all). Click <strong>Revise</strong> and the AI
          will weave your answers into your draft. Empty boxes are skipped.
        </p>
        <ul className="flex flex-col gap-2">
          {coach.targeted_questions.map((tq, i) => {
            const def = criteriaByKey.get(tq.criterion_key)
            return (
              <li key={i} className="flex flex-col gap-1">
                <label
                  htmlFor={`coach-q-${i}`}
                  className="text-foreground text-xs font-medium"
                >
                  {tq.question}
                </label>
                {def ? (
                  <span className="text-muted-foreground text-[11px]">
                    Targets: {def.label}
                  </span>
                ) : null}
                <Textarea
                  id={`coach-q-${i}`}
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswerAt(i, e.target.value)}
                  placeholder="A short answer is fine — 1–2 sentences."
                  rows={2}
                  disabled={merging}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {filledCount}/{coach.targeted_questions.length} filled
        </span>
        <div className="flex items-center gap-2">
          {mergeError ? (
            <span className="text-destructive text-xs">{mergeError}</span>
          ) : null}
          <Button
            type="button"
            onClick={onRevise}
            disabled={filledCount === 0 || merging}
          >
            {merging ? "Revising…" : "Revise with these answers"}
          </Button>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setExamplesOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          aria-expanded={examplesOpen}
        >
          {examplesOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {examplesOpen ? "Hide" : "Show"} {coach.examples.length} calibration
          example{coach.examples.length === 1 ? "" : "s"}
        </button>
        {examplesOpen ? (
          <ul className="mt-2 flex flex-col gap-2">
            {coach.examples.map((ex, i) => (
              <li
                key={i}
                className="border-border bg-background rounded-md border p-2 text-xs"
              >
                <div className="text-muted-foreground italic">{ex.context}</div>
                <p className="text-foreground mt-1">{ex.answer}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

