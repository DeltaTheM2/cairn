import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { getLLMProvider } from "@/lib/llm"
import { computeCostUsd, estimateMaxCostUsd, MODELS } from "@/lib/llm/pricing"
import type { CoachInput, CoachOutput } from "@/lib/llm/schemas"
import { checkAndRecord } from "@/lib/rate-limit"

const PROMPT_VERSION = "v1"
const ESTIMATED_INPUT_TOKENS = 1000
const MAX_OUTPUT_TOKENS = 800

export type CoachCallContext = {
  userId: string
  projectId: number
  documentInstanceId: number
}

export type CoachCallResult =
  | { ok: true; data: CoachOutput }
  | {
      ok: false
      error: "rate_limited" | "budget_exceeded" | "coach_error"
      message: string
    }

/**
 * Mirrors callJudge: rate-limit (30/hour for coach) -> per-project
 * budget pre-flight -> provider.coach -> log to llm_call_logs +
 * increment projects.cost_used_usd on success.
 */
export async function callCoach(
  input: CoachInput,
  ctx: CoachCallContext,
): Promise<CoachCallResult> {
  const rl = await checkAndRecord(ctx.userId, "coach")
  if (!rl.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "coach",
      model: MODELS.coach,
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
    MODELS.coach,
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
      callType: "coach",
      model: MODELS.coach,
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
    const result = await provider.coach(input)
    const costUsd = computeCostUsd(MODELS.coach, result.usage)

    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "coach",
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
      callType: "coach",
      model: MODELS.coach,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "error",
      errorMessage: message.slice(0, 500),
    })
    return { ok: false, error: "coach_error", message }
  }
}
