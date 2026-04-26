import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { getLLMProvider } from "@/lib/llm"
import { computeCostUsd, estimateMaxCostUsd, MODELS } from "@/lib/llm/pricing"
import type { JudgeInput, JudgeOutput } from "@/lib/llm/schemas"
import { checkAndRecord } from "@/lib/rate-limit"

const PROMPT_VERSION = "v1"
const ESTIMATED_INPUT_TOKENS = 600
const MAX_OUTPUT_TOKENS = 400

export type JudgeCallContext = {
  userId: string
  projectId: number
  documentInstanceId: number
}

export type JudgeCallResult =
  | { ok: true; data: JudgeOutput }
  | {
      ok: false
      error: "rate_limited" | "budget_exceeded" | "judge_error"
      message: string
    }

/**
 * High-level judge wrapper used by server actions. Order:
 * 1. Per-user rate limit (60/hour for judge).
 * 2. Per-project budget pre-flight against the worst-case cost.
 * 3. Provider call.
 * 4. Log to llm_call_logs (always) and increment projects.cost_used_usd
 *    (only on success).
 *
 * Auth + ownership are the caller's responsibility — this assumes ctx
 * has already been authorized.
 */
export async function callJudge(
  input: JudgeInput,
  ctx: JudgeCallContext,
): Promise<JudgeCallResult> {
  const rl = await checkAndRecord(ctx.userId, "judge")
  if (!rl.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "judge",
      model: MODELS.judge,
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
    MODELS.judge,
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
      callType: "judge",
      model: MODELS.judge,
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
    const result = await provider.judge(input)
    const costUsd = computeCostUsd(MODELS.judge, result.usage)

    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "judge",
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
      callType: "judge",
      model: MODELS.judge,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "error",
      errorMessage: message.slice(0, 500),
    })
    return { ok: false, error: "judge_error", message }
  }
}
