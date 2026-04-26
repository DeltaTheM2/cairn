"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, Trash2 } from "lucide-react"

import { archiveDocument, deleteDocument } from "@/actions/documents"
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

type Props = {
  documentId: number
  projectId: number
  status: "draft" | "in_progress" | "complete" | "archived"
}

export function DocumentActions({ documentId, projectId, status }: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState<"archive" | "delete" | null>(
    null,
  )
  const [error, setError] = React.useState<string | null>(null)

  async function onArchive() {
    setError(null)
    setPending("archive")
    const result = await archiveDocument({ id: documentId })
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/app/projects/${projectId}`)
  }

  async function onDelete() {
    setError(null)
    setPending("delete")
    const result = await deleteDocument({ id: documentId })
    setPending(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/app/projects/${projectId}`)
  }

  return (
    <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-foreground text-base font-medium">Settings</h2>
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
              <AlertDialogTitle>Archive this document?</AlertDialogTitle>
              <AlertDialogDescription>
                It stays in the database but is hidden from the project view.
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
              <AlertDialogTitle>Delete this document?</AlertDialogTitle>
              <AlertDialogDescription>
                Soft-delete: row stays with a deleted_at timestamp; sections
                and answers are kept too. Purge logic ships later.
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
