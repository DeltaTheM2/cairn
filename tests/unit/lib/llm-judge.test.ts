import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { llmCallLogs, projects, rateLimitBuckets, users } from "@/lib/db/schema"
import { callJudge } from "@/lib/llm/calls/judge"
import { resetLLMProvider } from "@/lib/llm"

const U1 = {
  id: "j-u1",
  email: "j-u1@example.com",
  name: "U1",
  image: null,
}

const baseInput = {
  doc_type: "prd",
  section_title: "Vision & Problem",
  question_prompt: "What problem are we solving?",
  question_rubric: "Be specific about who is affected and what's broken.",
  question_examples: ["good answer 1"],
  user_answer: "",
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

describe("callJudge", () => {
  it("returns judge output, logs the call, and increments project cost", async () => {
    const projectId = await makeProject()
    const r = await callJudge(
      { ...baseInput, user_answer: "x".repeat(400) },
      { userId: U1.id, projectId, documentInstanceId: 1 },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.score).toBe(5)
    expect(r.data.one_line_verdict).toBeTruthy()

    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(1)
    expect(logs[0].callType).toBe("judge")
    expect(logs[0].status).toBe("ok")
    expect(Number(logs[0].costUsd)).toBeGreaterThan(0)

    const [pj] = await db
      .select({ used: projects.costUsedUsd })
      .from(projects)
      .where(sql`id = ${projectId}`)
      .limit(1)
    expect(Number(pj.used)).toBeGreaterThan(0)
  })

  it("fails closed with budget_exceeded when the worst-case cost > remaining", async () => {
    const projectId = await makeProject({
      budget: "0.00010",
      used: "0.00000",
    })
    const r = await callJudge(
      { ...baseInput, user_answer: "x".repeat(400) },
      { userId: U1.id, projectId, documentInstanceId: 1 },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("budget_exceeded")

    const logs = await db.select().from(llmCallLogs)
    expect(logs[0].status).toBe("budget_exceeded")
  })

  it("rate-limits after the per-call hourly cap (60 judge calls/hour)", async () => {
    const projectId = await makeProject({ budget: "100.0000" })
    const past = new Date(Date.now() - 5 * 60 * 1000)
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "call:judge",
      windowStart: past,
      count: 60,
    })
    const r = await callJudge(
      { ...baseInput, user_answer: "x".repeat(400) },
      { userId: U1.id, projectId, documentInstanceId: 1 },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("rate_limited")

    const logs = await db.select().from(llmCallLogs)
    expect(logs[0].status).toBe("rate_limited")
  })

  it("output shape matches the judgeOutputSchema", async () => {
    const projectId = await makeProject()
    const cases = [
      { user_answer: "tbd", expectedScore: 1 },
      { user_answer: "x".repeat(50), expectedScore: 2 },
      { user_answer: "x".repeat(100), expectedScore: 3 },
      { user_answer: "x".repeat(200), expectedScore: 4 },
      { user_answer: "x".repeat(400), expectedScore: 5 },
    ]
    for (const c of cases) {
      const r = await callJudge(
        { ...baseInput, user_answer: c.user_answer },
        { userId: U1.id, projectId, documentInstanceId: 1 },
      )
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect(r.data.score).toBe(c.expectedScore)
    }
  })
})
