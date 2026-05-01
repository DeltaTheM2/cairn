import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { getLLMProvider } from "@/lib/llm"
import { computeCostUsd, estimateMaxCostUsd, MODELS } from "@/lib/llm/pricing"
import type { SynthesizeChunk } from "@/lib/llm/provider"
import type { SynthesizeInput } from "@/lib/llm/schemas"
import { checkAndRecord } from "@/lib/rate-limit"

const PROMPT_VERSION = "v1"
const ESTIMATED_INPUT_TOKENS = 5000
const MAX_OUTPUT_TOKENS = 6000

export type SynthesizeCallContext = {
  userId: string
  projectId: number
  documentInstanceId: number
}

export type SynthesizePreflightResult =
  | { ok: true }
  | {
      ok: false
      error: "rate_limited" | "budget_exceeded"
      message: string
    }

/**
 * Pre-flight before opening the stream. Rate-limit (10/hour for
 * synthesizer) plus per-project budget against the worst-case cost
 * (5000 in / 6000 out on claude-sonnet-4-6). Logs status='rate_limited'
 * or 'budget_exceeded' to llm_call_logs on rejection so refusals stay
 * observable.
 */
export async function preflightSynthesize(
  ctx: SynthesizeCallContext,
): Promise<SynthesizePreflightResult> {
  const rl = await checkAndRecord(ctx.userId, "synthesizer")
  if (!rl.ok) {
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "synthesizer",
      model: MODELS.synthesizer,
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
    MODELS.synthesizer,
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
      callType: "synthesizer",
      model: MODELS.synthesizer,
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

  return { ok: true }
}

/**
 * Streams synthesis chunks. Caller must have passed preflightSynthesize.
 * On the terminating 'done' chunk we log to llm_call_logs and increment
 * projects.cost_used_usd from the actual usage. On provider throw we log
 * status='error' and re-throw — the SSE route surfaces the failure to
 * the client.
 */
export async function* runSynthesize(
  input: SynthesizeInput,
  ctx: SynthesizeCallContext,
  signal?: AbortSignal,
): AsyncGenerator<SynthesizeChunk, void, void> {
  const provider = getLLMProvider()
  try {
    for await (const chunk of provider.synthesize(input, signal)) {
      if (chunk.type === "done") {
        const costUsd = computeCostUsd(MODELS.synthesizer, chunk.usage)
        await logCallAndIncrementCost({
          projectId: ctx.projectId,
          documentInstanceId: ctx.documentInstanceId,
          userId: ctx.userId,
          callType: "synthesizer",
          model: chunk.model,
          promptVersion: chunk.promptVersion,
          tokensIn: chunk.usage.inputTokens,
          tokensOut: chunk.usage.outputTokens,
          costUsd,
          latencyMs: chunk.usage.latencyMs,
          status: "ok",
        })
      }
      yield chunk
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logCallAndIncrementCost({
      projectId: ctx.projectId,
      documentInstanceId: ctx.documentInstanceId,
      userId: ctx.userId,
      callType: "synthesizer",
      model: MODELS.synthesizer,
      promptVersion: PROMPT_VERSION,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 0,
      status: "error",
      errorMessage: message.slice(0, 500),
    })
    throw err
  }
}
