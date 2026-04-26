import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { llmCallLogs, projects } from "@/lib/db/schema"

export type CallType = "judge" | "coach" | "suggester" | "synthesizer"

export type PreflightInput = {
  projectId: number
  estimatedCostUsd: number
}

export type PreflightResult =
  | { ok: true; budgetUsd: number; usedUsd: number; remainingUsd: number }
  | { ok: false; error: "project_not_found" | "budget_exceeded" }

/**
 * Reads the project's current budget + used spend and decides whether to
 * allow a call whose worst-case cost is `estimatedCostUsd`. Fails closed.
 */
export async function preflightCost(
  input: PreflightInput,
): Promise<PreflightResult> {
  const [row] = await db
    .select({
      used: projects.costUsedUsd,
      budget: projects.costBudgetUsd,
    })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1)

  if (!row) return { ok: false, error: "project_not_found" }

  const used = Number(row.used)
  const budget = Number(row.budget)
  if (used + input.estimatedCostUsd > budget) {
    return { ok: false, error: "budget_exceeded" }
  }
  return {
    ok: true,
    budgetUsd: budget,
    usedUsd: used,
    remainingUsd: budget - used,
  }
}

export type LogCallInput = {
  projectId?: number | null
  documentInstanceId?: number | null
  userId: string
  callType: CallType
  model: string
  promptVersion: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  latencyMs: number
  status: "ok" | "error" | "rate_limited" | "budget_exceeded"
  errorMessage?: string | null
}

/**
 * Writes a row to llm_call_logs and (only on status='ok') increments the
 * project's costUsedUsd atomically. Wrapped in a transaction so a failed
 * counter update doesn't leave a logged-but-uncounted call.
 */
export async function logCallAndIncrementCost(input: LogCallInput) {
  await db.transaction(async (tx) => {
    await tx.insert(llmCallLogs).values({
      projectId: input.projectId ?? null,
      documentInstanceId: input.documentInstanceId ?? null,
      userId: input.userId,
      callType: input.callType,
      model: input.model,
      promptVersion: input.promptVersion,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd.toFixed(6),
      latencyMs: input.latencyMs,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
    })

    if (input.projectId && input.status === "ok" && input.costUsd > 0) {
      await tx
        .update(projects)
        .set({
          costUsedUsd: sql`${projects.costUsedUsd} + ${input.costUsd.toFixed(6)}`,
        })
        .where(eq(projects.id, input.projectId))
    }
  })
}
