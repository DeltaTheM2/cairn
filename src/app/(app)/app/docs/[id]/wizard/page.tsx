import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { getDocument } from "@/actions/documents"
import { buttonVariants } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export default async function WizardPlaceholder({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const result = await getDocument({ id })
  if (!result.ok) notFound()
  const doc = result.data

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/app/docs/${doc.id}`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ChevronLeft className="h-4 w-4" />
          {doc.name}
        </Link>
        <ThemeToggle />
      </div>

      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          Wizard · placeholder
        </span>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {doc.name}
        </h1>
      </header>

      <div className="border-border bg-card text-card-foreground flex flex-col gap-2 rounded-lg border border-dashed p-8 text-center">
        <p className="text-foreground text-base font-medium">
          Wizard ships in P4.2.
        </p>
        <p className="text-muted-foreground text-sm">
          The {doc.sections.length} sections seeded for this document will
          render here as a section-mode wizard with rule-checked answer
          submission. Adequacy judging and the coach loop come in P5.2 / P5.3.
        </p>
      </div>
    </main>
  )
}
