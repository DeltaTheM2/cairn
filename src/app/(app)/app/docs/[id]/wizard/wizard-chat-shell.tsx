"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight, Lock } from "lucide-react"

import { QuestionCard } from "@/app/(app)/app/docs/[id]/wizard/question-card"
import type {
  AnswerFeedback,
  WizardAnswer,
  WizardSection,
} from "@/app/(app)/app/docs/[id]/wizard/wizard-shell"
import { Button } from "@/components/ui/button"
import type { QuestionBank } from "@/lib/validation/question-bank"

type Props = {
  documentId: number
  documentName: string
  bank: QuestionBank
  sections: WizardSection[]
  answers: WizardAnswer[]
}

type FlatItem = {
  sectionKey: string
  sectionTitle: string
  sectionDescription: string
  questionKey: string
  question: QuestionBank["sections"][number]["questions"][number]
  sectionDbId: number
}

export function WizardChatShell({
  documentId,
  documentName,
  bank,
  sections,
  answers,
}: Props) {
  const sectionMapInitial = React.useMemo(
    () => new Map(sections.map((s) => [s.key, s])),
    [sections],
  )
  const sectionIdByKey = React.useMemo(
    () => new Map(sections.map((s) => [s.key, s.id])),
    [sections],
  )

  const initialAnswerMap = React.useMemo(() => {
    const m = new Map<string, WizardAnswer>()
    for (const a of answers) m.set(`${a.sectionId}.${a.questionKey}`, a)
    return m
  }, [answers])

  const [answerMap, setAnswerMap] =
    React.useState<Map<string, WizardAnswer>>(initialAnswerMap)
  const [sectionMap, setSectionMap] =
    React.useState<Map<string, WizardSection>>(sectionMapInitial)

  const flat: FlatItem[] = React.useMemo(() => {
    const items: FlatItem[] = []
    for (const bs of bank.sections) {
      const dbId = sectionIdByKey.get(bs.key)
      if (!dbId) continue
      for (const q of bs.questions) {
        items.push({
          sectionKey: bs.key,
          sectionTitle: bs.title,
          sectionDescription: bs.description,
          questionKey: q.key,
          question: q,
          sectionDbId: dbId,
        })
      }
    }
    return items
  }, [bank, sectionIdByKey])

  function isItemAccessible(item: FlatItem) {
    const idx = bank.sections.findIndex((s) => s.key === item.sectionKey)
    if (idx <= 0) return true
    const prev = bank.sections[idx - 1]
    return sectionMap.get(prev.key)?.status === "complete"
  }

  function firstAccessibleIncompleteIndex() {
    for (let i = 0; i < flat.length; i++) {
      const item = flat[i]
      if (!isItemAccessible(item)) continue
      const ans = answerMap.get(`${item.sectionDbId}.${item.questionKey}`)
      if (!ans?.rawText) return i
    }
    // if all answered, point at the last one
    return flat.length - 1
  }

  const [index, setIndex] = React.useState<number>(() =>
    firstAccessibleIncompleteIndex(),
  )

  const current = flat[index]
  const accessible = current ? isItemAccessible(current) : false
  const currentAns = current
    ? answerMap.get(`${current.sectionDbId}.${current.questionKey}`)
    : undefined

  const totalAccessible = flat.filter(isItemAccessible).length
  const completedCount = flat.filter((it) => {
    const a = answerMap.get(`${it.sectionDbId}.${it.questionKey}`)
    return !!a?.rawText
  }).length

  function nextAccessibleIndex(start: number, dir: 1 | -1) {
    let i = start + dir
    while (i >= 0 && i < flat.length) {
      if (isItemAccessible(flat[i])) return i
      i += dir
    }
    return -1
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
    if (opts.questionComplete) {
      const target = nextAccessibleIndex(index, 1)
      if (target !== -1) setIndex(target)
    }
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

  const prevIdx = nextAccessibleIndex(index, -1)
  const nextIdx = nextAccessibleIndex(index, 1)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1 text-center">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          Chat · {bank.title} v{bank.version}
        </span>
        <h1 className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {documentName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {completedCount}/{totalAccessible} answered
        </p>
      </header>

      {!current ? (
        <p className="text-muted-foreground text-center text-sm">
          No questions available.
        </p>
      ) : !accessible ? (
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <Lock className="text-muted-foreground h-5 w-5" />
          <p className="text-muted-foreground text-sm">
            Complete the previous section to unlock this question.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground text-xs uppercase tracking-wider">
            {current.sectionTitle}
          </span>
          <QuestionCard
            key={`${current.sectionKey}.${current.questionKey}`}
            documentId={documentId}
            sectionKey={current.sectionKey}
            question={current.question}
            initialDraft={currentAns?.draftText ?? ""}
            initialRawText={currentAns?.rawText ?? ""}
            initialScore={currentAns?.adequacyScore ?? null}
            initialFeedback={currentAns?.judgeFeedback ?? null}
            initialSoftWarned={currentAns?.isSoftWarned ?? false}
            onAnswerSubmitted={onAnswerSubmitted}
            onDraftSaved={onDraftSaved}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => prevIdx !== -1 && setIndex(prevIdx)}
          disabled={prevIdx === -1}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-muted-foreground text-xs">
          {index + 1} / {flat.length}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => nextIdx !== -1 && setIndex(nextIdx)}
          disabled={nextIdx === -1}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
