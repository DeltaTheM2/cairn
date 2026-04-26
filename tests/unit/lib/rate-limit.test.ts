import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db"
import { rateLimitBuckets, users } from "@/lib/db/schema"
import { checkAndRecord } from "@/lib/rate-limit"

const U1 = {
  id: "rl-u1",
  email: "rl-u1@example.com",
  name: "U1",
  image: null,
}

beforeEach(async () => {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  await db.execute(sql`TRUNCATE TABLE rate_limit_buckets`)
  await db.execute(sql`TRUNCATE TABLE users`)
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
  await db.insert(users).values(U1)
})

describe("checkAndRecord", () => {
  it("allows and increments under the per-call hourly limit", async () => {
    const r1 = await checkAndRecord(U1.id, "judge")
    expect(r1).toEqual({ ok: true })
    const r2 = await checkAndRecord(U1.id, "judge")
    expect(r2).toEqual({ ok: true })

    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(sql`user_id = ${U1.id}`)
    // Two buckets: one for "call:judge", one for "total" — same window_start,
    // each at count=2 after two calls.
    const judgeRow = rows.find((r) => r.bucketKey === "call:judge")
    const totalRow = rows.find((r) => r.bucketKey === "total")
    expect(judgeRow?.count).toBe(2)
    expect(totalRow?.count).toBe(2)
  })

  it("rejects with hour_limit once the per-call cap is reached", async () => {
    const past = new Date(Date.now() - 5 * 60 * 1000) // within the hour
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "call:coach",
      windowStart: past,
      count: 30, // matches the coach limit exactly
    })
    const r = await checkAndRecord(U1.id, "coach")
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("hour_limit")
  })

  it("rejects with daily_limit when the 200/day total backstop is hit", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000) // 1h ago, within the day
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "total",
      windowStart: past,
      count: 200,
    })
    const r = await checkAndRecord(U1.id, "judge")
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toBe("daily_limit")
  })

  it("ignores buckets older than the hour window", async () => {
    const veryOld = new Date(Date.now() - 65 * 60 * 1000) // 65min ago — out of hour window
    await db.insert(rateLimitBuckets).values({
      userId: U1.id,
      bucketKey: "call:judge",
      windowStart: veryOld,
      count: 100,
    })
    const r = await checkAndRecord(U1.id, "judge")
    expect(r).toEqual({ ok: true })
  })

  it("treats users independently", async () => {
    const otherUser = {
      id: "rl-u2",
      email: "rl-u2@example.com",
      name: "U2",
      image: null,
    }
    await db.insert(users).values(otherUser)

    const past = new Date(Date.now() - 5 * 60 * 1000)
    await db.insert(rateLimitBuckets).values({
      userId: otherUser.id,
      bucketKey: "call:synthesizer",
      windowStart: past,
      count: 10,
    })

    // U1 still has their full quota even though U2 is at the limit
    const r = await checkAndRecord(U1.id, "synthesizer")
    expect(r).toEqual({ ok: true })
  })
})
