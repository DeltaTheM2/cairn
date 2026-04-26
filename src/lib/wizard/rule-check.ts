import type { QuestionRules } from "@/lib/validation/question-bank"

export type RuleCheckResult = { ok: true } | { ok: false; error: string }

/**
 * Pure deterministic rule-check. Runs BEFORE the LLM judge — fail closes
 * mean the user gets immediate feedback without burning tokens. Match
 * matters case-insensitive for must_contain_*. The trim()-ed length is
 * what counts for min_length; whitespace padding doesn't sneak past.
 */
export function ruleCheck(
  answer: string,
  rules: QuestionRules,
): RuleCheckResult {
  const trimmed = answer.trim()

  if (rules.min_length !== undefined && trimmed.length < rules.min_length) {
    return {
      ok: false,
      error: `At least ${rules.min_length} characters needed (you have ${trimmed.length}).`,
    }
  }

  if (rules.max_length !== undefined && answer.length > rules.max_length) {
    return {
      ok: false,
      error: `At most ${rules.max_length} characters allowed (you have ${answer.length}).`,
    }
  }

  if (rules.must_contain_any && rules.must_contain_any.length > 0) {
    const lower = trimmed.toLowerCase()
    const hit = rules.must_contain_any.some((term) =>
      lower.includes(term.toLowerCase()),
    )
    if (!hit) {
      return {
        ok: false,
        error: `Mention at least one of: ${rules.must_contain_any.join(", ")}.`,
      }
    }
  }

  if (rules.must_contain_all && rules.must_contain_all.length > 0) {
    const lower = trimmed.toLowerCase()
    const missing = rules.must_contain_all.filter(
      (term) => !lower.includes(term.toLowerCase()),
    )
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Missing required term(s): ${missing.join(", ")}.`,
      }
    }
  }

  if (rules.regex) {
    let re: RegExp
    try {
      re = new RegExp(rules.regex)
    } catch {
      return { ok: false, error: "Bank regex is invalid; please report." }
    }
    if (!re.test(answer)) {
      return { ok: false, error: "Doesn't match the required format." }
    }
  }

  return { ok: true }
}
