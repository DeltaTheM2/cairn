"use client"

import * as React from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { updateUserPreferences } from "@/actions/preferences"
import { Button } from "@/components/ui/button"
import type { Theme } from "@/lib/validation/preferences"

const OPTIONS = [
  { value: "system" as const, label: "System", Icon: Monitor },
  { value: "light" as const, label: "Light", Icon: Sun },
  { value: "dark" as const, label: "Dark", Icon: Moon },
]

export function ThemeSelector({ initial }: { initial: Theme }) {
  const { setTheme } = useTheme()
  const [current, setCurrent] = React.useState<Theme>(initial)
  const [pending, setPending] = React.useState(false)

  async function pick(value: Theme) {
    if (value === current || pending) return
    const previous = current
    setCurrent(value)
    setTheme(value)
    setPending(true)
    const result = await updateUserPreferences({ theme: value })
    setPending(false)
    if (!result.ok) {
      setCurrent(previous)
      setTheme(previous)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = current === value
        return (
          <Button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            variant={active ? "default" : "outline"}
            size="lg"
            disabled={pending}
            onClick={() => pick(value)}
            className="justify-start gap-2"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
