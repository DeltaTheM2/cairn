import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { listProjects } from "@/actions/projects"
import { NewProjectDialog } from "@/app/(app)/app/projects/new-project-dialog"
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

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

export default async function ProjectsPage() {
  const result = await listProjects()
  if (!result.ok) throw new Error(result.error)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10 sm:py-14">
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
        <ThemeToggle />
      </div>

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Projects
          </h1>
          <p className="text-muted-foreground text-sm">
            Each project is a container for the docs you produce inside it.
          </p>
        </div>
        <NewProjectDialog />
      </header>

      {result.data.length === 0 ? (
        <div className="border-border bg-card text-card-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <h2 className="font-medium">No projects yet</h2>
          <p className="text-muted-foreground text-sm">
            Create your first project to start producing PRDs and other docs.
          </p>
        </div>
      ) : (
        <div className="border-border rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/app/projects/${p.id}`}
                      className="hover:underline"
                    >
                      <div className="font-medium">{p.name}</div>
                      {p.description ? (
                        <div className="text-muted-foreground line-clamp-1 text-xs">
                          {p.description}
                        </div>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-muted-foreground text-xs capitalize">
                      {p.status}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-muted-foreground text-xs">
                      {formatDate(p.updatedAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/projects/${p.id}`}
                      aria-label={`Open ${p.name}`}
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
    </main>
  )
}
