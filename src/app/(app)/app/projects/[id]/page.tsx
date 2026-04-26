import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"

import { listDocuments } from "@/actions/documents"
import { NewDocumentDialog } from "@/app/(app)/app/projects/[id]/new-document-dialog"
import { ProjectActions } from "@/app/(app)/app/projects/[id]/project-actions"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ThemeToggle } from "@/components/theme-toggle"
import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { projects } from "@/lib/db/schema"

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.ownerId, user.id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)

  if (!project) notFound()

  const docsResult = await listDocuments({ projectId: project.id })
  const docs = docsResult.ok ? docsResult.data : []
  const activeDocs = docs.filter((d) => d.status !== "archived")

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/app/projects"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ChevronLeft className="h-4 w-4" />
          Projects
        </Link>
        <ThemeToggle />
      </div>

      <header className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs tracking-wider uppercase">
          Project · {project.status}
        </span>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        {project.description ? (
          <p className="text-muted-foreground text-sm">{project.description}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Updated {formatDate(project.updatedAt)}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            Documents
          </div>
          <div className="text-foreground mt-1 text-2xl font-semibold">
            {activeDocs.length}
          </div>
          <div className="text-muted-foreground text-xs">
            {docs.length === activeDocs.length
              ? "All active."
              : `${docs.length - activeDocs.length} archived.`}
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            LLM cost
          </div>
          <div className="text-foreground mt-1 text-2xl font-semibold">
            ${Number(project.costUsedUsd).toFixed(2)}
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              / ${Number(project.costBudgetUsd).toFixed(2)}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">Per-project cap.</div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-foreground text-base font-medium">Documents</h2>
          <NewDocumentDialog projectId={project.id} />
        </div>

        {docs.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
            <FileText className="text-muted-foreground h-6 w-6" />
            <p className="text-muted-foreground text-sm">
              No documents yet — start a PRD to seed the wizard.
            </p>
          </div>
        ) : (
          <div className="border-border rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link
                        href={`/app/docs/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.name}
                      </Link>
                      <div className="text-muted-foreground text-xs sm:hidden">
                        {d.docType.toUpperCase()} · {d.status}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-muted-foreground text-xs uppercase">
                        {d.docType}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-muted-foreground text-xs capitalize">
                        {d.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/docs/${d.id}`}
                        aria-label={`Open ${d.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <ProjectActions
        projectId={project.id}
        initialName={project.name}
        initialDescription={project.description ?? ""}
        status={project.status}
      />
    </main>
  )
}
