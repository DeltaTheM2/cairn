import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { getLLMProvider } from "@/lib/llm"
import { computeCostUsd, estimateMaxCostUsd, MODELS } from "@/lib/llm/pricing"
import type { SuggestInput, SuggestOutput } from "@/lib/llm/schemas"
import { checkAndRecord } from "@/lib/rate-limit"

const PROMPT_VERSION = "v1"
const ESTIMATED_INPUT_TOKENS = 3000
const MAX_OUTPUT_TOKENS = 2000

export type SuggestCallContext = {
  userId: string
  projectId: number
  documentInstanceId: number
}

export type SuggestCallResult =
  | { ok: true; data: SuggestOutput }
  | {
      ok: false
      error: "rate_limited" | "budget_exceeded" | "suggester_error"
      message: string
    }

/**
 * Mirrors callJudge / callCoach: per-user rate limit (20/hr for
 * suggester) → per-project budget pre-flight against the worst-case
 * Sonnet cost (3000 in / 2000 out) → provider.suggest → Zod-validated
 * output (validation happens inside the provider) → log to
 * llm_call_logs and increment projects.cost_used_usd on success.
 */
export async function callSuggest(
  input: SuggestInput,
  ctx: SuggestCallContext,
): Promise<SuggestCallResult> {
  const rl = await checkAndRecord(ctx.userId, "suggester")
  if (!rl.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "suggester",
      model: MODELS.suggester,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "rate_limited",
      errorMessage: rl.error,
    })
    return { ok: false, error: "rate_limited", message: rl.error }
  }

  const estimated = estimateMaxCostUsd(
    MODELS.suggester,
    ESTIMATED_INPUT_TOKENS,
    MAX_OUTPUT_TOKENS,
  )
  const pre = await preflightCost({
    projectId: ctx.projectId,
    estimatedCostUsd: estimated,
  })
  if (!pre.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "suggester",
      model: MODELS.suggester,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "budget_exceeded",
      errorMessage: pre.error,
    })
    return { ok: false, error: "budget_exceeded", message: pre.error }
  }

  const provider = getLLMProvider()
  try {
    const result = await provider.suggest(input)
    const costUsd = computeCostUsd(MODELS.suggester, result.usage)

    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "suggester",
      model: result.model,
      promptVersion: result.promptVersion,
      tokensIn: result.usage.inputTokens,
      tokensOut: result.usage.outputTokens,
      costUsd,
      latencyMs: result.usage.latencyMs,
      status: "ok",
    })

    return { ok: true, data: result.data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "suggester",
      model: MODELS.suggester,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "error",
      errorMessage: message.slice(0, 500),
    })
    return { ok: false, error: "suggester_error", message }
  }
}
