import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { logCallAndIncrementCost, preflightCost } from "@/lib/cost-tracker"
import { db } from "@/lib/db"
import { llmCallLogs, projects, users } from "@/lib/db/schema"

const U1 = {
  id: "ct-u1",
  email: "ct-u1@example.com",
  name: "U1",
  image: null,
}

beforeEach(async () => {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  await db.execute(sql`TRUNCATE TABLE llm_call_logs`)
  await db.execute(sql`TRUNCATE TABLE projects`)
  await db.execute(sql`TRUNCATE TABLE users`)
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
  await db.insert(users).values(U1)
})

async function insertProject(opts?: { budget?: string; used?: string }) {
  const [r] = await db.insert(projects).values({
    ownerId: U1.id,
    name: "P",
    costBudgetUsd: opts?.budget ?? "5.0000",
    costUsedUsd: opts?.used ?? "0.0000",
  })
  return r.insertId
}

describe("preflightCost", () => {
  it("ok when used + estimated <= budget", async () => {
    const id = await insertProject({ budget: "5.0000", used: "1.0000" })
    const r = await preflightCost({ projectId: id, estimatedCostUsd: 0.5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.remainingUsd).toBeCloseTo(4)
  })

  it("rejects when used + estimated would exceed budget", async () => {
    const id = await insertProject({ budget: "5.0000", used: "4.7" })
    const r = await preflightCost({ projectId: id, estimatedCostUsd: 0.4 })
    expect(r).toEqual({ ok: false, error: "budget_exceeded" })
  })

  it("returns project_not_found for an unknown projectId", async () => {
    const r = await preflightCost({
      projectId: 999_999,
      estimatedCostUsd: 0.01,
    })
    expect(r).toEqual({ ok: false, error: "project_not_found" })
  })
})

describe("logCallAndIncrementCost", () => {
  it("writes a log row and bumps cost_used_usd on status=ok", async () => {
    const id = await insertProject()
    await logCallAndIncrementCost({
      projectId: id,
      userId: U1.id,
      callType: "judge",
      model: "claude-haiku-4-5",
      promptVersion: "v1",
      tokensIn: 500,
      tokensOut: 100,
      costUsd: 0.001,
      latencyMs: 1234,
      status: "ok",
    })
    const [row] = await db
      .select({ used: projects.costUsedUsd })
      .from(projects)
      .where(sql`id = ${id}`)
      .limit(1)
    expect(Number(row.used)).toBeCloseTo(0.001, 6)

    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(1)
    expect(logs[0].callType).toBe("judge")
    expect(logs[0].status).toBe("ok")
  })

  it("does NOT bump cost_used_usd for a non-ok status", async () => {
    const id = await insertProject({ used: "0.0000" })
    await logCallAndIncrementCost({
      projectId: id,
      userId: U1.id,
      callType: "synthesizer",
      model: "claude-sonnet-4-6",
      promptVersion: "v1",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: 50,
      status: "rate_limited",
      errorMessage: "hour_limit",
    })
    const [row] = await db
      .select({ used: projects.costUsedUsd })
      .from(projects)
      .where(sql`id = ${id}`)
      .limit(1)
    expect(Number(row.used)).toBe(0)

    const logs = await db.select().from(llmCallLogs)
    expect(logs[0].status).toBe("rate_limited")
    expect(logs[0].errorMessage).toBe("hour_limit")
  })
})
