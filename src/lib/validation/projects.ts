import { z } from "zod"

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(255, "Name must be at most 255 characters")

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be at most 2000 characters")
  .optional()

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema,
})

export const renameProjectInputSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: projectNameSchema,
  description: projectDescriptionSchema,
})

export const projectIdInputSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>
export type RenameProjectInput = z.infer<typeof renameProjectInputSchema>
export type ProjectIdInput = z.infer<typeof projectIdInputSchema>
