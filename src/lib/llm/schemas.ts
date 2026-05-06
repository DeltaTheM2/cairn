import { z } from "zod"

/* ---------------- Judge ---------------- */

export const criterionVerdictSchema = z.object({
  key: z.string().min(1).max(64),
  met: z.boolean(),
  why_not: z.string().max(500).optional(),
})
export type CriterionVerdict = z.infer<typeof criterionVerdictSchema>

export const judgeOutputSchema = z.object({
  // The model still emits a score as a sanity check, but the source of
  // truth for adequacy is the per-criterion verdicts below — server
  // derives the final score from criteria coverage via scoreFromCriteria.
  score: z.number().int().min(1).max(5),
  criteria: z.array(criterionVerdictSchema).min(1).max(20),
  one_line_verdict: z.string().max(280),
})
export type JudgeOutput = z.infer<typeof judgeOutputSchema>

const criterionPromptSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1),
  hint: z.string().min(1),
})
export type CriterionPrompt = z.infer<typeof criterionPromptSchema>

export const judgeInputSchema = z.object({
  doc_type: z.string(),
  section_title: z.string(),
  question_prompt: z.string(),
  question_criteria: z.array(criterionPromptSchema),
  question_examples: z.array(z.string()),
  user_answer: z.string(),
})
export type JudgeInput = z.infer<typeof judgeInputSchema>

/* ---------------- Coach ---------------- */

export const targetedQuestionSchema = z.object({
  criterion_key: z.string().min(1).max(64),
  question: z.string().min(1).max(500),
})
export type TargetedQuestion = z.infer<typeof targetedQuestionSchema>

export const coachOutputSchema = z.object({
  targeted_questions: z.array(targetedQuestionSchema).min(1).max(8),
  examples: z
    .array(
      z.object({
        context: z.string().max(200),
        answer: z.string().max(500),
      }),
    )
    .min(1)
    .max(6),
  encouragement: z.string().max(400),
})
export type CoachOutput = z.infer<typeof coachOutputSchema>

const failedCriterionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1),
  hint: z.string().min(1),
  why_not: z.string().optional(),
})
export type FailedCriterion = z.infer<typeof failedCriterionSchema>

export const coachInputSchema = z.object({
  doc_type: z.string(),
  section_title: z.string(),
  question_prompt: z.string(),
  user_answer: z.string(),
  failed_criteria: z.array(failedCriterionSchema).min(1),
  revision_count: z.number(),
})
export type CoachInput = z.infer<typeof coachInputSchema>

/* ---------------- Merge ---------------- */

export const mergeOutputSchema = z.object({
  revised_draft: z.string().min(1).max(8000),
  change_summary: z.string().max(300),
})
export type MergeOutput = z.infer<typeof mergeOutputSchema>

export const mergeInputSchema = z.object({
  question_prompt: z.string(),
  original_draft: z.string(),
  qa_pairs: z.array(
    z.object({
      criterion_key: z.string(),
      criterion_label: z.string(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
})
export type MergeInput = z.infer<typeof mergeInputSchema>

/* ---------------- Suggester ---------------- */

const suggestionItemSchema = z.object({
  title: z.string().max(100),
  rationale: z.string().max(300),
  suggested_question: z.string().max(300),
  confidence: z.enum(["high", "medium", "low"]),
})
export type SuggestionItem = z.infer<typeof suggestionItemSchema>

export const suggesterOutputSchema = z.object({
  missing_features: z.array(suggestionItemSchema).max(15),
  edge_cases: z.array(suggestionItemSchema).max(15),
  risks: z.array(suggestionItemSchema).max(15),
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
