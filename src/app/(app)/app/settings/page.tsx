import Link from "next/link"
import { eq } from "drizzle-orm"
import { ChevronLeft } from "lucide-react"

import { ThemeSelector } from "@/components/settings/theme-selector"
import { WizardModeSelector } from "@/components/settings/wizard-mode-selector"
import { buttonVariants } from "@/components/ui/button"
import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"

export default async function SettingsPage() {
  const user = await requireUser()

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)

  const wizardMode = prefs?.wizardMode ?? "section"
  const theme = prefs?.theme ?? "system"

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10 sm:py-16">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/app"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <span className="text-muted-foreground text-sm">{user.email}</span>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Persisted to your account — applies on every device you sign in from.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-foreground text-base font-medium">Wizard mode</h2>
          <p className="text-muted-foreground text-sm">
            How questions are presented as you walk a document.
          </p>
        </div>
        <WizardModeSelector initial={wizardMode} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-foreground text-base font-medium">Theme</h2>
          <p className="text-muted-foreground text-sm">
            Light, dark, or follow your operating system.
          </p>
        </div>
        <ThemeSelector initial={theme} />
      </section>
    </main>
  )
}
