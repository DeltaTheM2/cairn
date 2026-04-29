/**
 * Two paths to "complete":
 *   1. Judge scored >= 3 (good or borderline-with-soft-warn).
 *   2. Judge scored <= 2 but the answer was force-completed after the
 *      coach loop hit its iteration cap — these carry isSoftWarned=true
 *      and the user is allowed to advance per spec § 4.3.
 */
export function isAnswerComplete(a: {
  adequacyScore: number | null
  isSoftWarned: boolean
}): boolean {
  if (a.adequacyScore == null) return false
  return a.adequacyScore >= 3 || a.isSoftWarned
}
