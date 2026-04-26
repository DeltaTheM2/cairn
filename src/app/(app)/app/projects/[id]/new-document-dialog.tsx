"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { z } from "zod"

import { createDocument } from "@/actions/documents"
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
import { SUPPORTED_DOC_TYPES } from "@/lib/question-bank"
import { createDocumentInputSchema } from "@/lib/validation/documents"

const newDocumentFormSchema = createDocumentInputSchema.omit({
  projectId: true,
})
type NewDocumentFormValues = z.infer<typeof newDocumentFormSchema>

const DOC_TYPE_LABELS: Record<string, string> = {
  prd: "PRD — Product Requirements Document",
}

const FUTURE_DOC_TYPES = [
  { value: "srs", label: "SRS (post-MVP)" },
  { value: "adr", label: "ADR (post-MVP)" },
  { value: "user_story", label: "User Story (post-MVP)" },
]

export function NewDocumentDialog({ projectId }: { projectId: number }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const form = useForm<NewDocumentFormValues>({
    resolver: zodResolver(newDocumentFormSchema),
    defaultValues: { docType: "prd", name: "" },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form

  async function onSubmit(values: NewDocumentFormValues) {
    setServerError(null)
    const result = await createDocument({ projectId, ...values })
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    reset({ docType: "prd", name: "" })
    setOpen(false)
    router.push(`/app/docs/${result.data.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset({ docType: "prd", name: "" })
          setServerError(null)
        }
      }}
    >
      <DialogTrigger render={<Button size="lg" />}>
        <Plus className="h-4 w-4" />
        New document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            The wizard seeds one section per item in the document type&apos;s
            question bank.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="nd-type" className="text-sm font-medium">
              Type
            </label>
            <select
              id="nd-type"
              className="border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm"
              {...register("docType")}
            >
              {SUPPORTED_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABELS[t] ?? t}
                </option>
              ))}
              {FUTURE_DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value} disabled>
                  {t.label}
                </option>
              ))}
            </select>
            {errors.docType ? (
              <p className="text-destructive text-xs">
                {errors.docType.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="nd-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="nd-name"
              autoFocus
              placeholder="My PRD"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-destructive text-xs">{errors.name.message}</p>
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
