import prdBank from "../../prompts/question-banks/prd.json"

/**
 * Minimal question-bank shape used by P3.2's document creation flow.
 * P4.1's seeder will define the full Zod schema and seed `question_banks`.
 * Until then we read directly from the JSON files (bundled at build time).
 */
export type QuestionBankSection = {
  key: string
  title: string
  description: string
  questions: Array<{ key: string; prompt: string }>
}

export type QuestionBank = {
  doc_type: string
  version: string
  title: string
  description?: string
  sections: QuestionBankSection[]
}

const BANKS: Record<string, QuestionBank> = {
  prd: prdBank as QuestionBank,
}

export const SUPPORTED_DOC_TYPES = ["prd"] as const
export type SupportedDocType = (typeof SUPPORTED_DOC_TYPES)[number]

export function loadQuestionBank(docType: SupportedDocType): QuestionBank {
  const bank = BANKS[docType]
  if (!bank) {
    throw new Error(`No question bank for doc type "${docType}"`)
  }
  return bank
}
