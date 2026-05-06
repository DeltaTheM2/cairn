import { z } from "zod"

export const saveDraftInputSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  sectionKey: z.string().min(1).max(64),
  questionKey: z.string().min(1).max(64),
  draftText: z.string().max(20000),
})

export const submitAnswerInputSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  sectionKey: z.string().min(1).max(64),
  questionKey: z.string().min(1).max(64),
  rawText: z.string().min(1).max(20000),
})

export const mergeAnswerInputSchema = z.object({
  documentId: z.coerce.number().int().positive(),
  sectionKey: z.string().min(1).max(64),
  questionKey: z.string().min(1).max(64),
  originalDraft: z.string().max(20000),
  qaPairs: z
    .array(
      z.object({
        criterion_key: z.string().min(1).max(64),
        criterion_label: z.string().min(1).max(140),
        question: z.string().min(1).max(500),
        answer: z.string().max(2000),
      }),
    )
    .min(1)
    .max(8),
})

export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>
export type SubmitAnswerInput = z.infer<typeof submitAnswerInputSchema>
export type MergeAnswerInput = z.infer<typeof mergeAnswerInputSchema>
