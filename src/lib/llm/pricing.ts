/**
 * Anthropic API pricing per million tokens (USD).
 * Verified 2026-04-25 against the claude-api skill's cached models table.
 *
 * Cache writes for the default 5-minute TTL are 1.25× input price; cache
 * reads are 0.10× input price. We always use the 5-minute TTL.
 */
export const PRICING = {
  "claude-haiku-4-5": {
    inputPerMtok: 1.0,
    outputPerMtok: 5.0,
  },
  "claude-sonnet-4-6": {
    inputPerMtok: 3.0,
    outputPerMtok: 15.0,
  },
} as const

export type SupportedModel = keyof typeof PRICING

export const MODELS = {
  judge: "claude-haiku-4-5",
  coach: "claude-haiku-4-5",
  suggester: "claude-sonnet-4-6",
  synthesizer: "claude-sonnet-4-6",
} as const satisfies Record<string, SupportedModel>

export type CallUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}

export function computeCostUsd(
  model: SupportedModel,
  usage: CallUsage,
): number {
  const p = PRICING[model]
  const cacheWriteRate = p.inputPerMtok * 1.25
  const cacheReadRate = p.inputPerMtok * 0.1
  return (
    (usage.inputTokens / 1_000_000) * p.inputPerMtok +
    (usage.outputTokens / 1_000_000) * p.outputPerMtok +
    ((usage.cacheCreationTokens ?? 0) / 1_000_000) * cacheWriteRate +
    ((usage.cacheReadTokens ?? 0) / 1_000_000) * cacheReadRate
  )
}

/**
 * Conservative pre-flight cost ceiling — assumes max possible token usage
 * (full input + max output) so the budget check fails closed early rather
 * than after running the call.
 */
export function estimateMaxCostUsd(
  model: SupportedModel,
  estimatedInputTokens: number,
  maxOutputTokens: number,
): number {
  return computeCostUsd(model, {
    inputTokens: estimatedInputTokens,
    outputTokens: maxOutputTokens,
  })
}
