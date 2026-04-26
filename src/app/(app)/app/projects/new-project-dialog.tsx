"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { createProject } from "@/actions/projects"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  createProjectInputSchema,
  type CreateProjectInput,
} from "@/lib/validation/projects"

export function NewProjectDialog() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectInputSchema),
    defaultValues: { name: "", description: "" },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form

  async function onSubmit(values: CreateProjectInput) {
    setServerError(null)
    const result = await createProject(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    reset()
    setOpen(false)
    router.push(`/app/projects/${result.data.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset()
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="lg" />}>
        <Plus className="h-4 w-4" />
        New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group related docs (PRD, SRS, ADRs, user stories) under one project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="np-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="np-name"
              autoFocus
              placeholder="Cairn"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-destructive text-xs">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="np-desc" className="text-sm font-medium">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Input
              id="np-desc"
              placeholder="One-line summary of what this project is"
              aria-invalid={errors.description ? true : undefined}
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-destructive text-xs">
                {errors.description.message}
              </p>
            ) : null}
          </div>
          {serverError ? (
            <p className="text-destructive text-xs">{serverError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
