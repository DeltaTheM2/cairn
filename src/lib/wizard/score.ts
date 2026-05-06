/**
 * Adequacy is now criterion-driven, not vibe-driven. The judge returns
 * a list of {key, met, why_not?} verdicts per question; this helper
 * collapses that coverage into the same 1–5 score the rest of the
 * pipeline (UI score badges, soft-warn thresholds, isAnswerComplete)
 * already speaks.
 *
 * Buckets:
 *   100% met  → 5
 *   ≥75% met  → 4
 *   ≥50% met  → 3
 *   ≥25% met  → 2
 *    <25% met → 1
 *
 * Empty criteria array (shouldn't happen post-bank-conversion but be
 * defensive) → 1.
 */
export type CriterionVerdict = {
  key: string
  met: boolean
  why_not?: string
}

export function scoreFromCriteria(
  criteria: ReadonlyArray<CriterionVerdict>,
): 1 | 2 | 3 | 4 | 5 {
  if (criteria.length === 0) return 1
  const met = criteria.filter((c) => c.met).length
  const ratio = met / criteria.length
  if (ratio >= 1.0) return 5
  if (ratio >= 0.75) return 4
  if (ratio >= 0.5) return 3
  if (ratio >= 0.25) return 2
  return 1
}

export function failedCriteria<T extends CriterionVerdict>(
  criteria: ReadonlyArray<T>,
): T[] {
  return criteria.filter((c) => !c.met)
}
