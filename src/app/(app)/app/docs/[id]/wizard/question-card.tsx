"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react"

import { saveDraft, submitAnswer } from "@/actions/answers"
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

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = React.useRef(initialDraft)

  const isSubmitted = submittedText.length > 0 && submittedText === text
  const isDirty = text.length > 0 && text !== submittedText
  const questionComplete =
    isSubmitted && isAnswerComplete({ adequacyScore: score, isSoftWarned })

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

      {feedback && isSubmitted ? (
        <FeedbackPanel
          feedback={feedback}
          score={score ?? 0}
          open={feedbackOpen}
          onToggle={() => setFeedbackOpen((o) => !o)}
        />
      ) : null}

      {coach && !questionComplete ? (
        <CoachPanel
          coach={coach}
          revisionCount={revisionCount}
          maxIterations={MAX_COACH_ITERATIONS}
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

function FeedbackPanel({
  feedback,
  score,
  open,
  onToggle,
}: {
  feedback: AnswerFeedback
  score: number
  open: boolean
  onToggle: () => void
}) {
  const tone =
    score >= 4
      ? "border-foreground/20 bg-muted/40"
      : score === 3
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-destructive/30 bg-destructive/5"

  return (
    <div className={cn("rounded-md border p-3", tone)}>
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
        Judge feedback
      </button>
      <p className="text-foreground mt-2 text-sm">{feedback.oneLineVerdict}</p>
      {open ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FeedbackList label="Strengths" items={feedback.strengths} />
          <FeedbackList label="Weaknesses" items={feedback.weaknesses} />
          <FeedbackList label="Suggestions" items={feedback.suggestions} />
        </div>
      ) : null}
    </div>
  )
}

function CoachPanel({
  coach,
  revisionCount,
  maxIterations,
}: {
  coach: CoachOutput
  revisionCount: number
  maxIterations: number
}) {
  return (
    <div className="border-foreground/20 bg-muted/40 flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="text-foreground text-xs font-medium">
          Coach · attempt {revisionCount} of {maxIterations}
        </div>
        {coach.encouragement ? (
          <div className="text-muted-foreground text-xs italic">
            {coach.encouragement}
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-muted-foreground text-xs uppercase tracking-wider">
          Try this rephrasing
        </div>
        <p className="text-foreground mt-1 text-sm">
          {coach.rephrased_question}
        </p>
      </div>

      <div>
        <div className="text-muted-foreground text-xs uppercase tracking-wider">
          Examples (don&apos;t copy — calibrate)
        </div>
        <ul className="mt-1 flex flex-col gap-2">
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
      </div>

      <div>
        <div className="text-muted-foreground text-xs uppercase tracking-wider">
          Follow-up to consider
        </div>
        <p className="text-foreground mt-1 text-sm">{coach.follow_up}</p>
      </div>
    </div>
  )
}

function FeedbackList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <div>
        <div className="text-muted-foreground text-xs uppercase tracking-wider">
          {label}
        </div>
        <p className="text-muted-foreground mt-1 text-xs italic">none</p>
      </div>
    )
  }
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="text-foreground text-xs">
            • {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
