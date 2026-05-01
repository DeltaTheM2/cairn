import Link from "next/link"
import { notFound } from "next/navigation"
import { and, desc, eq } from "drizzle-orm"
import { ChevronLeft, Download } from "lucide-react"

import { getDocument } from "@/actions/documents"
import { DocumentActions } from "@/app/(app)/app/docs/[id]/document-actions"
import { buttonVariants } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { db } from "@/lib/db"
import { documentExports } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-accent text-accent-foreground",
  complete: "bg-primary text-primary-foreground",
}

export default async function DocumentDetailPage({
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

  const completed = doc.sections.filter((s) => s.status === "complete").length
  const total = doc.sections.length

  const [latestMdExport] = await db
    .select({ id: documentExports.id })
    .from(documentExports)
    .where(
      and(
        eq(documentExports.documentInstanceId, doc.id),
        eq(documentExports.format, "md"),
      ),
    )
    .orderBy(desc(documentExports.generatedAt))
    .limit(1)
  const hasExport = !!latestMdExport

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/app/projects/${doc.projectId}`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ChevronLeft className="h-4 w-4" />
          {doc.projectName}
        </Link>
        <ThemeToggle />
      </div>

      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs uppercase tracking-wider">
          {doc.docType} · v{doc.questionBankVersion} · {doc.status}
        </span>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {doc.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          {completed}/{total} sections complete
        </p>
      </header>

      <Link
        href={`/app/docs/${doc.id}/wizard`}
        className={buttonVariants({ size: "lg", className: "w-full sm:w-fit" })}
      >
        Start wizard
      </Link>

      {hasExport ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-foreground text-base font-medium">Download</h2>
          <div className="flex flex-wrap gap-2">
            {(["md", "pdf", "docx"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/docs/${doc.id}/export/${fmt}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
                download
              >
                <Download className="h-4 w-4" />
                {fmt.toUpperCase()}
              </a>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            PDF and DOCX are generated on first request and cached until you
            re-synthesize.
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-foreground text-base font-medium">Sections</h2>
        <ol className="border-border divide-border flex flex-col divide-y rounded-lg border">
          {doc.sections.map((s, idx) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground font-mono text-xs">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-foreground text-sm font-medium">
                    {s.title}
                  </span>
                </div>
                {s.description ? (
                  <p className="text-muted-foreground text-xs">
                    {s.description}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs capitalize",
                  STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {s.status.replace("_", " ")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <DocumentActions
        documentId={doc.id}
        projectId={doc.projectId}
        status={doc.status}
      />
    </main>
  )
}
