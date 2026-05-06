import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { getLLMProvider } from "@/lib/llm"
import { computeCostUsd, estimateMaxCostUsd, MODELS } from "@/lib/llm/pricing"
import type { MergeInput, MergeOutput } from "@/lib/llm/schemas"
import { checkAndRecord } from "@/lib/rate-limit"

const PROMPT_VERSION = "v1"
const ESTIMATED_INPUT_TOKENS = 1500
const MAX_OUTPUT_TOKENS = 1500

export type MergeCallContext = {
  userId: string
  projectId: number
  documentInstanceId: number
}

export type MergeCallResult =
  | { ok: true; data: MergeOutput }
  | {
      ok: false
      error: "rate_limited" | "budget_exceeded" | "merge_error"
      message: string
    }

/**
 * Mirrors callJudge / callCoach. Rate-limit (30/hr for merge, paired
 * with coach) → per-project budget pre-flight against worst-case Haiku
 * cost (1500 in / 1500 out) → provider.merge → log + increment cost.
 */
export async function callMerge(
  input: MergeInput,
  ctx: MergeCallContext,
): Promise<MergeCallResult> {
  const rl = await checkAndRecord(ctx.userId, "merge")
  if (!rl.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "merge",
      model: MODELS.merge,
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
    MODELS.merge,
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
      callType: "merge",
      model: MODELS.merge,
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
    const result = await provider.merge(input)
    const costUsd = computeCostUsd(MODELS.merge, result.usage)

    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "merge",
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
      callType: "merge",
      model: MODELS.merge,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "error",
      errorMessage: message.slice(0, 500),
    })
    return { ok: false, error: "merge_error", message }
  }
}
