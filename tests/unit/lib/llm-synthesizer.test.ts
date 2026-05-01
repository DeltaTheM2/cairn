import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { llmCallLogs, projects, rateLimitBuckets, users } from "@/lib/db/schema"
import { resetLLMProvider } from "@/lib/llm"
import { preflightSynthesize, runSynthesize } from "@/lib/llm/calls/synthesizer"
import type { SynthesizeChunk } from "@/lib/llm/provider"
import type { SynthesizeInput } from "@/lib/llm/schemas"

const U1 = {
  id: "s-u1",
  email: "s-u1@example.com",
  name: "U1",
  image: null,
}

const baseInput: SynthesizeInput = {
  doc_type: "prd",
  doc_name: "MyDoc",
  timestamp_iso: "2026-04-28T12:00:00Z",
  synthesis_template: "TEMPLATE",
  sections_and_answers: "SECTION: Vision\n  Q: ?\n  A: yes",
  soft_warned_summary: "(none)",
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

describe("preflightSynthesize", () => {
  it("rejects when worst-case cost > remaining budget", async () => {
    const projectId = await makeProject({
      budget: "0.00001",
      used: "0.00000",
    })
    const r = await preflightSynthesize({
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("budget_exceeded")

    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(1)
    expect(logs[0].callType).toBe("synthesizer")
    expect(logs[0].status).toBe("budget_exceeded")
  })

  it("rejects after the per-call hourly cap (10 synth calls/hour)", async () => {
    const projectId = await makeProject({ budget: "100.0000" })
    const past = new Date(Date.now() - 5 * 60 * 1000)
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "call:synthesizer",
      windowStart: past,
      count: 10,
    })
    const r = await preflightSynthesize({
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

  it("allows under-budget under-cap calls without logging", async () => {
    const projectId = await makeProject()
    const r = await preflightSynthesize({
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })
    expect(r.ok).toBe(true)
    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(0)
  })
})

describe("runSynthesize", () => {
  it("yields delta + done, logs status='ok', and increments cost", async () => {
    const projectId = await makeProject()
    const chunks: SynthesizeChunk[] = []
    for await (const c of runSynthesize(baseInput, {
      userId: U1.id,
      projectId,
      documentInstanceId: 1,
    })) {
      chunks.push(c)
    }
    const deltas = chunks.filter((c) => c.type === "delta")
    const done = chunks.find((c) => c.type === "done")
    expect(deltas.length).toBeGreaterThan(0)
    expect(done?.type).toBe("done")
    if (done?.type === "done") {
      expect(done.fullText.length).toBeGreaterThan(0)
    }

    const logs = await db.select().from(llmCallLogs)
    expect(logs.length).toBe(1)
    expect(logs[0].callType).toBe("synthesizer")
    expect(logs[0].status).toBe("ok")
    expect(Number(logs[0].costUsd)).toBeGreaterThan(0)

    const [pj] = await db
      .select({ used: projects.costUsedUsd })
      .from(projects)
      .where(sql`id = ${projectId}`)
      .limit(1)
    expect(Number(pj.used)).toBeGreaterThan(0)
  })
})
