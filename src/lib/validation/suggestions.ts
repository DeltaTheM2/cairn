import { z } from "zod"

export const suggestForSectionInputSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  sectionKey: z.string().min(1).max(64),
})

export type SuggestForSectionInput = z.infer<
  typeof suggestForSectionInputSchema
>
