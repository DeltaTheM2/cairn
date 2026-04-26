"use client"

import * as React from "react"
import { LayoutList, MessageSquare } from "lucide-react"

import { updateUserPreferences } from "@/actions/preferences"
import { cn } from "@/lib/utils"
import type { WizardMode } from "@/lib/validation/preferences"

const OPTIONS = [
  {
    value: "section" as const,
    label: "Sections",
    description: "5–10 questions on one screen, save on blur.",
    Icon: LayoutList,
  },
  {
    value: "chat" as const,
    label: "Chat",
    description: "One question at a time, conversational pacing.",
    Icon: MessageSquare,
  },
]

export function WizardModeSelector({ initial }: { initial: WizardMode }) {
  const [current, setCurrent] = React.useState<WizardMode>(initial)
  const [pending, setPending] = React.useState(false)

  async function pick(value: WizardMode) {
    if (value === current || pending) return
    const previous = current
    setCurrent(value)
    setPending(true)
    const result = await updateUserPreferences({ wizardMode: value })
    setPending(false)
    if (!result.ok) setCurrent(previous)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Wizard mode"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {OPTIONS.map(({ value, label, description, Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => pick(value)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "border-foreground/40 bg-accent text-accent-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon className="h-4 w-4" />
              {label}
            </div>
            <p className="text-muted-foreground text-sm">{description}</p>
          </button>
        )
      })}
    </div>
  )
}
