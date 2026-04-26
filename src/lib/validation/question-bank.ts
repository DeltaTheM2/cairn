import { z } from "zod"

export const questionRulesSchema = z
  .object({
    min_length: z.number().int().nonnegative().optional(),
    max_length: z.number().int().positive().optional(),
    must_contain_any: z.array(z.string()).optional(),
    must_contain_all: z.array(z.string()).optional(),
    regex: z.string().optional(),
  })
  .strict()

export const questionSchema = z
  .object({
    key: z.string().min(1).max(64),
    prompt: z.string().min(1),
    rules: questionRulesSchema.default({}),
    rubric: z.string().min(1),
    examples: z.array(z.string()).default([]),
  })
  .strict()

export const sectionSchema = z
  .object({
    key: z.string().min(1).max(64),
    title: z.string().min(1),
    description: z.string().min(1),
    questions: z.array(questionSchema).min(1),
  })
  .strict()

export const questionBankSchema = z
  .object({
    doc_type: z.string().min(1).max(32),
    version: z.string().min(1).max(16),
    title: z.string().min(1),
    description: z.string().optional(),
    sections: z.array(sectionSchema).min(1),
    synthesis_template: z.string().optional(),
  })
  .strict()

export type QuestionRules = z.infer<typeof questionRulesSchema>
export type Question = z.infer<typeof questionSchema>
export type Section = z.infer<typeof sectionSchema>
export type QuestionBank = z.infer<typeof questionBankSchema>
