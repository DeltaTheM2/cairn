"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, Pencil, Trash2 } from "lucide-react"

import {
  archiveProject,
  deleteProject,
  renameProject,
} from "@/actions/projects"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  projectId: number
  initialName: string
  initialDescription: string
  status: "active" | "archived" | "deleted"
}

export function ProjectActions({
  projectId,
  initialName,
  initialDescription,
  status,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(initialName)
  const [description, setDescription] = React.useState(initialDescription)
  const [pending, setPending] = React.useState<
    "rename" | "archive" | "delete" | null
  >(null)
  const [error, setError] = React.useState<string | null>(null)

  async function onRename() {
    setError(null)
    setPending("rename")
    const result = await renameProject({ id: projectId, name, description })
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function onArchive() {
    setError(null)
    setPending("archive")
    const result = await archiveProject({ id: projectId })
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push("/app/projects")
  }

  async function onDelete() {
    setError(null)
    setPending("delete")
    const result = await deleteProject({ id: projectId })
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push("/app/projects")
  }

  return (
    <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-foreground text-base font-medium">Settings</h2>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={pending !== null}
          >
            <Pencil className="h-4 w-4" />
            Rename
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending !== null}
          />
          <Input
            aria-label="Project description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={pending !== null}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(false)
                setName(initialName)
                setDescription(initialDescription)
                setError(null)
              }}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onRename}
              disabled={pending !== null || name.trim().length === 0}
            >
              {pending === "rename" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null || status === "archived"}
              />
            }
          >
            <Archive className="h-4 w-4" />
            {status === "archived" ? "Archived" : "Archive"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this project?</AlertDialogTitle>
              <AlertDialogDescription>
                It will be hidden from the projects list. You can still restore
                it manually from the database. (Unarchive UI ships later.)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button variant="outline" />}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction render={<Button onClick={onArchive} />}>
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                disabled={pending !== null}
              />
            }
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this project?</AlertDialogTitle>
              <AlertDialogDescription>
                Soft-delete: the row stays in the database with a deleted_at
                timestamp, but it disappears from the app. Documents inside the
                project are kept too — purge logic ships later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button variant="outline" />}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                render={<Button variant="destructive" onClick={onDelete} />}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </section>
  )
}
