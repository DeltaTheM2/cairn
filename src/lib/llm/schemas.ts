import { z } from "zod"

/* ---------------- Judge ---------------- */

export const judgeOutputSchema = z.object({
  score: z.number().int().min(1).max(5),
  strengths: z.array(z.string().max(200)).max(5),
  weaknesses: z.array(z.string().max(200)).max(5),
  suggestions: z.array(z.string().max(200)).max(5),
  one_line_verdict: z.string().max(140),
})
export type JudgeOutput = z.infer<typeof judgeOutputSchema>

export const judgeInputSchema = z.object({
  doc_type: z.string(),
  section_title: z.string(),
  question_prompt: z.string(),
  question_rubric: z.string(),
  question_examples: z.array(z.string()),
  user_answer: z.string(),
})
export type JudgeInput = z.infer<typeof judgeInputSchema>

/* ---------------- Coach ---------------- */

export const coachOutputSchema = z.object({
  rephrased_question: z.string().max(500),
  examples: z
    .array(
      z.object({
        context: z.string().max(200),
        answer: z.string().max(500),
      }),
    )
    .min(2)
    .max(3),
  follow_up: z.string().max(300),
  encouragement: z.string().max(200),
})
export type CoachOutput = z.infer<typeof coachOutputSchema>

export const coachInputSchema = z.object({
  doc_type: z.string(),
  section_title: z.string(),
  question_prompt: z.string(),
  user_answer: z.string(),
  judge_score: z.number(),
  judge_strengths: z.array(z.string()),
  judge_weaknesses: z.array(z.string()),
  judge_suggestions: z.array(z.string()),
  revision_count: z.number(),
})
export type CoachInput = z.infer<typeof coachInputSchema>

/* ---------------- Suggester ---------------- */

const suggestionItemSchema = z.object({
  title: z.string().max(100),
  rationale: z.string().max(300),
  suggested_question: z.string().max(300),
  confidence: z.enum(["high", "medium", "low"]),
})
export type SuggestionItem = z.infer<typeof suggestionItemSchema>

export const suggesterOutputSchema = z.object({
  missing_features: z.array(suggestionItemSchema).max(7),
  edge_cases: z.array(suggestionItemSchema).max(7),
  risks: z.array(suggestionItemSchema).max(7),
})
export type SuggestOutput = z.infer<typeof suggesterOutputSchema>

export const suggestInputSchema = z.object({
  doc_type: z.string(),
  doc_name: z.string(),
  section_title: z.string(),
  section_description: z.string(),
  section_answers: z.string(),
  project_context: z.string(),
})
export type SuggestInput = z.infer<typeof suggestInputSchema>

/* ---------------- Synthesizer ---------------- */

export const synthesizeInputSchema = z.object({
  doc_type: z.string(),
  doc_name: z.string(),
  timestamp_iso: z.string(),
  synthesis_template: z.string(),
  sections_and_answers: z.string(),
  soft_warned_summary: z.string(),
})
export type SynthesizeInput = z.infer<typeof synthesizeInputSchema>
