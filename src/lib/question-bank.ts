import prdBank from "../../prompts/question-banks/prd.json"

import {
  questionBankSchema,
  type QuestionBank,
  type Section,
} from "@/lib/validation/question-bank"

export type { QuestionBank, Section }
export type QuestionBankSection = Section

const BANKS: Record<string, QuestionBank> = {
  prd: questionBankSchema.parse(prdBank),
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

export function listAllQuestionBankFiles(): Array<{
  docType: string
  bank: QuestionBank
}> {
  return Object.entries(BANKS).map(([docType, bank]) => ({ docType, bank }))
}
