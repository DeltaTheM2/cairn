"use client"

import * as React from "react"
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"

import { saveDraft, submitAnswer } from "@/actions/answers"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Question } from "@/lib/validation/question-bank"

type SaveState = "idle" | "saving" | "saved" | "error"

type Props = {
  documentId: number
  sectionKey: string
  question: Question
  initialDraft: string
  initialRawText: string
  onAnswerSubmitted: (opts: {
    sectionKey: string
    questionKey: string
    rawText: string
    sectionComplete: boolean
  }) => void
  onDraftSaved: (opts: {
    sectionKey: string
    questionKey: string
    draftText: string
  }) => void
}

const DEBOUNCE_MS = 800

export function QuestionCard({
  documentId,
  sectionKey,
  question,
  initialDraft,
  initialRawText,
  onAnswerSubmitted,
  onDraftSaved,
}: Props) {
  const initial = initialDraft || initialRawText || ""
  const [text, setText] = React.useState(initial)
  const [submittedText, setSubmittedText] = React.useState(initialRawText)
  const [saveState, setSaveState] = React.useState<SaveState>("idle")
  const [submitState, setSubmitState] = React.useState<"idle" | "submitting">(
    "idle",
  )
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [examplesOpen, setExamplesOpen] = React.useState(false)

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = React.useRef(initialDraft)

  const isSubmitted = submittedText.length > 0 && submittedText === text
  const isDirty = text.length > 0 && text !== submittedText

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
    lastSavedRef.current = ""
    onAnswerSubmitted({
      sectionKey,
      questionKey: question.key,
      rawText: text,
      sectionComplete: result.data.sectionComplete,
    })
  }

  const minLen = question.rules.min_length
  const maxLen = question.rules.max_length
  const trimmedLen = text.trim().length

  return (
    <article
      className={cn(
        "border-border flex flex-col gap-3 rounded-lg border p-4",
        isSubmitted && "border-foreground/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-foreground text-sm font-medium">{question.prompt}</p>
        {isSubmitted ? (
          <span className="text-foreground inline-flex shrink-0 items-center gap-1 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            Submitted
          </span>
        ) : null}
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
          {saveState === "saved" && !isSubmitted ? <span>Draft saved</span> : null}
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
              ? "Submitting…"
              : isSubmitted
                ? "Resubmit"
                : "Submit"}
          </Button>
        </div>
      </div>
    </article>
  )
}
