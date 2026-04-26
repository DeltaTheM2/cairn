import { z } from "zod"

import { SUPPORTED_DOC_TYPES } from "@/lib/question-bank"

export const docTypeSchema = z.enum(SUPPORTED_DOC_TYPES)

export const documentNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(255, "Name must be at most 255 characters")

export const createDocumentInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  docType: docTypeSchema,
  name: documentNameSchema,
})

export const projectScopedListInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
})

export const documentIdInputSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>
export type ProjectScopedListInput = z.infer<
  typeof projectScopedListInputSchema
>
export type DocumentIdInput = z.infer<typeof documentIdInputSchema>
