import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { llmCallLogs, projects, rateLimitBuckets, users } from "@/lib/db/schema"
import { resetLLMProvider } from "@/lib/llm"
import { callSuggest } from "@/lib/llm/calls/suggester"

const U1 = {
  id: "g-u1",
  email: "g-u1@example.com",
  name: "U1",
  image: null,
}

const baseInput = {
  doc_type: "prd",
  doc_name: "MyDoc",
  section_title: "Vision & Problem",
  section_description: "What problem are we solving and why does it matter?",
  section_answers: "Q: What problem?\nA: Engineers waste hours on docs.",
  project_context: "(no other sections answered yet)",
}

beforeEach(async () => {
  resetLLMProvider()
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  await db.execute(sql`TRUNCATE TABLE llm_call_logs`)
  await db.execute(sql`TRUNCATE TABLE rate_limit_buckets`)
  await db.execute(sql`TRUNCATE TABLE projects`)
  await db.execute(sql`TRUNCATE TABLE users`)
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
  await db.insert(users).values(U1)
})

async function makeProject(opts?: { budget?: string; used?: string }) {
  const [r] = await db.insert(projects).values({
    ownerId: U1.id,
    name: "P",
    costBudgetUsd: opts?.budget ?? "5.0000",
    costUsedUsd: opts?.used ?? "0.0000",
  })
  return r.insertId
}

describe("callSuggest", () => {
  it("returns three categorized lists, logs the call, increments cost", async () => {
    const projectId = await makeProject()
    const r = await callSuggest(baseInput, {
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Array.isArray(r.data.missing_features)).toBe(true)
    expect(Array.isArray(r.data.edge_cases)).toBe(true)
    expect(Array.isArray(r.data.risks)).toBe(true)

    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(1)
    expect(logs[0].callType).toBe("suggester")
    expect(logs[0].status).toBe("ok")
    expect(Number(logs[0].costUsd)).toBeGreaterThan(0)

    const [pj] = await db
      .select({ used: projects.costUsedUsd })
      .from(projects)
      .where(sql`id = ${projectId}`)
      .limit(1)
    expect(Number(pj.used)).toBeGreaterThan(0)
  })

  it("fails closed with budget_exceeded when worst-case cost > remaining", async () => {
    const projectId = await makeProject({
      budget: "0.00001",
      used: "0.00000",
    })
    const r = await callSuggest(baseInput, {
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("budget_exceeded")

    const logs = await db.select().from(llmCallLogs)
    expect(logs[0].status).toBe("budget_exceeded")
  })

  it("rate-limits after the per-call hourly cap (20 suggester calls/hour)", async () => {
    const projectId = await makeProject({ budget: "100.0000" })
    const past = new Date(Date.now() - 5 * 60 * 1000)
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "call:suggester",
      windowStart: past,
      count: 20,
    })
    const r = await callSuggest(baseInput, {
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("rate_limited")

    const logs = await db.select().from(llmCallLogs)
    expect(logs[0].status).toBe("rate_limited")
  })
})
