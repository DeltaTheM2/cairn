"use client"

import * as React from "react"
import { Lightbulb, Loader2 } from "lucide-react"

import { suggestForSection } from "@/actions/suggestions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { SuggestOutput, SuggestionItem } from "@/lib/llm/schemas"
import { cn } from "@/lib/utils"

type Props = {
  documentId: number
  sectionKey: string
  sectionTitle: string
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; output: SuggestOutput }
  | { kind: "error"; message: string }

type Category = "missing_features" | "edge_cases" | "risks"

const CATEGORY_LABELS: Record<Category, string> = {
  missing_features: "Missing features",
  edge_cases: "Edge cases",
  risks: "Risks",
}

const CONFIDENCE_TONE: Record<SuggestionItem["confidence"], string> = {
  high: "border-foreground/30 bg-foreground/5 text-foreground",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
}

function itemKey(category: Category, index: number) {
  return `${category}:${index}`
}

export function SuggesterButton({
  documentId,
  sectionKey,
  sectionTitle,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>({ kind: "idle" })
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [copied, setCopied] = React.useState(false)

  function reset() {
    setState({ kind: "idle" })
    setSelected(new Set())
    setCopied(false)
  }

  async function load() {
    setState({ kind: "loading" })
    setSelected(new Set())
    setCopied(false)
    const r = await suggestForSection({ documentId, sectionKey })
    if (!r.ok) {
      setState({ kind: "error", message: r.error })
      return
    }
    setState({ kind: "loaded", output: r.data })
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function copySelected() {
    if (state.kind !== "loaded") return
    const lines: string[] = []
    for (const cat of Object.keys(CATEGORY_LABELS) as Category[]) {
      const items = state.output[cat]
      const picked = items
        .map((it, i) => ({ it, i }))
        .filter(({ i }) => selected.has(itemKey(cat, i)))
      if (picked.length === 0) continue
      lines.push(`## ${CATEGORY_LABELS[cat]}`)
      for (const { it } of picked) {
        lines.push(`- **${it.title}** (${it.confidence}): ${it.rationale}`)
        lines.push(`  Suggested follow-up: ${it.suggested_question}`)
      }
      lines.push("")
    }
    if (lines.length === 0) return
    await navigator.clipboard.writeText(lines.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
        else if (state.kind === "idle") load()
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Lightbulb className="h-4 w-4" />
        Suggest things I&apos;m missing
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>What might I be missing?</DialogTitle>
          <DialogDescription>
            Section: <span className="text-foreground">{sectionTitle}</span>.
            Pick items, copy them, and decide what to add to your answers.
          </DialogDescription>
        </DialogHeader>

        {state.kind === "loading" ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating suggestions…
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-destructive text-sm">{state.message}</p>
            <Button type="button" variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        ) : null}

        {state.kind === "loaded" ? (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
              const items = state.output[cat]
              return (
                <SuggestionCategory
                  key={cat}
                  label={CATEGORY_LABELS[cat]}
                  items={items}
                  selected={selected}
                  onToggle={(i) => toggle(itemKey(cat, i))}
                  category={cat}
                />
              )
            })}
          </div>
        ) : null}

        {state.kind === "loaded" ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-muted-foreground text-xs">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2">
              {copied ? (
                <span className="text-foreground text-xs">Copied ✓</span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={load}
                disabled={state.kind !== "loaded"}
              >
                Regenerate
              </Button>
              <Button
                type="button"
                onClick={copySelected}
                disabled={selected.size === 0}
              >
                Copy selected
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SuggestionCategory({
  label,
  items,
  selected,
  onToggle,
  category,
}: {
  label: string
  items: SuggestionItem[]
  selected: Set<string>
  onToggle: (index: number) => void
  category: Category
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-foreground text-sm font-semibold">{label}</h3>
        <p className="text-muted-foreground mt-1 text-xs italic">
          No suggestions in this category.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-foreground text-sm font-semibold">{label}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const key = itemKey(category, i)
          const isSelected = selected.has(key)
          return (
            <li
              key={i}
              className={cn(
                "border-border flex items-start gap-3 rounded-md border p-3 transition-colors",
                isSelected && "border-foreground/40 bg-muted/40",
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(i)}
                className="mt-1 h-4 w-4 cursor-pointer"
                aria-label={`Select suggestion: ${it.title}`}
              />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-foreground text-sm font-medium">
                    {it.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                      CONFIDENCE_TONE[it.confidence],
                    )}
                  >
                    {it.confidence}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">{it.rationale}</p>
                <p className="text-foreground text-xs italic">
                  ↳ {it.suggested_question}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
