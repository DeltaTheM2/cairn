"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, ChevronRight, CircleDot, Lock } from "lucide-react"

import { QuestionCard } from "@/app/(app)/app/docs/[id]/wizard/question-card"
import { SynthesisRail } from "@/app/(app)/app/docs/[id]/wizard/synthesis-rail"
import { cn } from "@/lib/utils"
import type { QuestionBank } from "@/lib/validation/question-bank"

export type WizardSection = {
  id: number
  key: string
  orderIndex: number
  status: "pending" | "in_progress" | "complete"
  hasSoftWarnings: boolean
}

export type AnswerFeedback = {
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  oneLineVerdict: string
}

export type WizardAnswer = {
  sectionId: number
  questionKey: string
  rawText: string
  draftText: string
  isSoftWarned: boolean
  adequacyScore: number | null
  judgeFeedback: AnswerFeedback | null
}

type Props = {
  documentId: number
  documentName: string
  bank: QuestionBank
  sections: WizardSection[]
  answers: WizardAnswer[]
}

function pickInitialKey(
  bank: QuestionBank,
  sections: WizardSection[],
  paramKey: string | null,
): string {
  const valid = sections.find((s) => s.key === paramKey)
  if (valid) return valid.key
  const firstIncomplete = sections.find((s) => s.status !== "complete")
  if (firstIncomplete) return firstIncomplete.key
  return bank.sections[0]?.key ?? sections[0]?.key ?? ""
}

export function WizardShell({
  documentId,
  documentName,
  bank,
  sections,
  answers,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramKey = searchParams.get("s")

  // Map of sectionKey -> sectionId for quick lookup.
  const sectionIdByKey = React.useMemo(
    () => new Map(sections.map((s) => [s.key, s.id])),
    [sections],
  )
  // Map keyed by `${sectionId}.${questionKey}` for current answer state.
  const initialAnswerMap = React.useMemo(() => {
    const m = new Map<string, WizardAnswer>()
    for (const a of answers) m.set(`${a.sectionId}.${a.questionKey}`, a)
    return m
  }, [answers])

  const [answerMap, setAnswerMap] =
    React.useState<Map<string, WizardAnswer>>(initialAnswerMap)
  const [sectionMap, setSectionMap] = React.useState<
    Map<string, WizardSection>
  >(() => new Map(sections.map((s) => [s.key, s])))

  const currentKey = pickInitialKey(bank, sections, paramKey)
  const currentSection = bank.sections.find((s) => s.key === currentKey)
  const currentDbSection = sectionMap.get(currentKey)

  function navigateTo(key: string) {
    router.replace(`/app/docs/${documentId}/wizard?s=${key}`, { scroll: false })
  }

  function isSectionAccessible(s: WizardSection) {
    if (s.status !== "pending") return true
    const idx = bank.sections.findIndex((b) => b.key === s.key)
    if (idx <= 0) return true
    const prev = bank.sections[idx - 1]
    const prevStatus = sectionMap.get(prev.key)?.status
    return prevStatus === "complete"
  }

  function onAnswerSubmitted(opts: {
    sectionKey: string
    questionKey: string
    rawText: string
    sectionComplete: boolean
    questionComplete: boolean
    isSoftWarned: boolean
    score: number
    feedback: AnswerFeedback
  }) {
    const sectionId = sectionIdByKey.get(opts.sectionKey)
    if (!sectionId) return
    setAnswerMap((prev) => {
      const next = new Map(prev)
      next.set(`${sectionId}.${opts.questionKey}`, {
        sectionId,
        questionKey: opts.questionKey,
        rawText: opts.rawText,
        draftText: "",
        isSoftWarned: opts.isSoftWarned,
        adequacyScore: opts.score,
        judgeFeedback: opts.feedback,
      })
      return next
    })
    setSectionMap((prev) => {
      const next = new Map(prev)
      const existing = next.get(opts.sectionKey)
      if (existing) {
        next.set(opts.sectionKey, {
          ...existing,
          status: opts.sectionComplete
            ? "complete"
            : opts.questionComplete
              ? "in_progress"
              : existing.status === "pending"
                ? "in_progress"
                : existing.status,
          hasSoftWarnings: existing.hasSoftWarnings || opts.isSoftWarned,
        })
      }
      return next
    })
  }

  function onDraftSaved(opts: {
    sectionKey: string
    questionKey: string
    draftText: string
  }) {
    const sectionId = sectionIdByKey.get(opts.sectionKey)
    if (!sectionId) return
    setAnswerMap((prev) => {
      const key = `${sectionId}.${opts.questionKey}`
      const next = new Map(prev)
      const existing = next.get(key)
      next.set(key, {
        sectionId,
        questionKey: opts.questionKey,
        rawText: existing?.rawText ?? "",
        draftText: opts.draftText,
        isSoftWarned: existing?.isSoftWarned ?? false,
        adequacyScore: existing?.adequacyScore ?? null,
        judgeFeedback: existing?.judgeFeedback ?? null,
      })
      return next
    })
  }

  const orderedSections = bank.sections.map((bs) => {
    const dbRow = sectionMap.get(bs.key)
    return { bank: bs, db: dbRow }
  })

  const completed = orderedSections.filter(
    (s) => s.db?.status === "complete",
  ).length
  const total = orderedSections.length
  const allComplete = total > 0 && completed === total

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          Wizard · {bank.title} v{bank.version}
        </span>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {documentName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {completed}/{total} sections complete
        </p>
      </header>

      {/* Mobile section selector */}
      <div className="lg:hidden">
        <label htmlFor="wizard-section-mobile" className="sr-only">
          Section
        </label>
        <select
          id="wizard-section-mobile"
          className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
          value={currentKey}
          onChange={(e) => navigateTo(e.target.value)}
        >
          {orderedSections.map(({ bank: bs, db }, idx) => {
            const accessible = db ? isSectionAccessible(db) : true
            return (
              <option
                key={bs.key}
                value={bs.key}
                disabled={!accessible}
              >
                {String(idx + 1).padStart(2, "0")} · {bs.title}{" "}
                {db?.status === "complete"
                  ? "✓"
                  : db?.status === "in_progress"
                    ? "…"
                    : !accessible
                      ? "🔒"
                      : ""}
              </option>
            )
          })}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        {/* Section rail (lg+) */}
        <aside className="hidden lg:block">
          <ol className="border-border divide-border flex flex-col divide-y rounded-lg border">
            {orderedSections.map(({ bank: bs, db }, idx) => {
              const accessible = db ? isSectionAccessible(db) : true
              const isCurrent = bs.key === currentKey
              const Icon =
                db?.status === "complete"
                  ? Check
                  : db?.status === "in_progress"
                    ? CircleDot
                    : accessible
                      ? ChevronRight
                      : Lock
              return (
                <li key={bs.key}>
                  <button
                    type="button"
                    onClick={() => accessible && navigateTo(bs.key)}
                    disabled={!accessible}
                    className={cn(
                      "flex w-full items-start gap-2 p-3 text-left transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      isCurrent && "bg-accent text-accent-foreground",
                      !isCurrent && accessible && "hover:bg-muted",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        db?.status === "complete" && "text-foreground",
                      )}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground font-mono text-xs">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="text-foreground text-sm font-medium">
                        {bs.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {bs.questions.length} question
                        {bs.questions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* Main: questions for the current section */}
        <section className="flex flex-col gap-6">
          {currentSection && currentDbSection ? (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-foreground text-xl font-semibold tracking-tight">
                  {currentSection.title}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {currentSection.description}
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {currentSection.questions.map((q) => {
                  const key = `${currentDbSection.id}.${q.key}`
                  const ans = answerMap.get(key)
                  return (
                    <QuestionCard
                      key={q.key}
                      documentId={documentId}
                      sectionKey={currentSection.key}
                      question={q}
                      initialDraft={ans?.draftText ?? ""}
                      initialRawText={ans?.rawText ?? ""}
                      initialScore={ans?.adequacyScore ?? null}
                      initialFeedback={ans?.judgeFeedback ?? null}
                      initialSoftWarned={ans?.isSoftWarned ?? false}
                      onAnswerSubmitted={onAnswerSubmitted}
                      onDraftSaved={onDraftSaved}
                    />
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No section selected.</p>
          )}
        </section>

        <aside>
          <SynthesisRail documentId={documentId} allComplete={allComplete} />
        </aside>
      </div>
    </div>
  )
}
