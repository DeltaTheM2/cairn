import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"
import { ChevronLeft } from "lucide-react"

import { ProjectActions } from "@/app/(app)/app/projects/[id]/project-actions"
import { buttonVariants } from "@/components/ui/button"
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
          <div className="text-foreground mt-1 text-2xl font-semibold">0</div>
          <div className="text-muted-foreground text-xs">
            Add a document in P3.2.
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

      <ProjectActions
        projectId={project.id}
        initialName={project.name}
        initialDescription={project.description ?? ""}
        status={project.status}
      />
    </main>
  )
}
