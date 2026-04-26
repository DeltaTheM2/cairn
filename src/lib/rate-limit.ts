import { and, eq, gte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { rateLimitBuckets } from "@/lib/db/schema"
import type { CallType } from "@/lib/cost-tracker"

const HOUR_LIMITS: Record<CallType, number> = {
  judge: 60,
  coach: 30,
  suggester: 20,
  synthesizer: 10,
}

const DAILY_TOTAL_CAP = 200

const SUB_BUCKET_MS = 10 * 60 * 1000 // 10 minutes
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const TOTAL_BUCKET_KEY = "total"
const callTypeBucketKey = (t: CallType) => `call:${t}`

function bucketStartFor(date: Date, granularityMs: number): Date {
  return new Date(Math.floor(date.getTime() / granularityMs) * granularityMs)
}

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false
      error: "hour_limit" | "daily_limit"
      retryAfterMs: number
    }

/**
 * Sliding-window rate limit. Sub-buckets are 10 minutes wide. The hourly
 * limit sums sub-buckets within the last 60 minutes; the daily backstop
 * sums every sub-bucket within the last 24 hours under the "total" key.
 *
 * On allow, increments BOTH the per-call-type sub-bucket and the "total"
 * sub-bucket for the current 10-minute slot.
 */
export async function checkAndRecord(
  userId: string,
  callType: CallType,
): Promise<RateLimitResult> {
  const limit = HOUR_LIMITS[callType]
  const now = new Date()
  const hourAgo = new Date(now.getTime() - HOUR_MS)
  const dayAgo = new Date(now.getTime() - DAY_MS)

  const callKey = callTypeBucketKey(callType)

  const [hourSum] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${rateLimitBuckets.count}), 0)` })
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketKey, callKey),
        gte(rateLimitBuckets.windowStart, hourAgo),
      ),
    )
  if (Number(hourSum?.sum ?? 0) >= limit) {
    return { ok: false, error: "hour_limit", retryAfterMs: HOUR_MS }
  }

  const [daySum] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${rateLimitBuckets.count}), 0)` })
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.userId, userId),
        eq(rateLimitBuckets.bucketKey, TOTAL_BUCKET_KEY),
        gte(rateLimitBuckets.windowStart, dayAgo),
      ),
    )
  if (Number(daySum?.sum ?? 0) >= DAILY_TOTAL_CAP) {
    return { ok: false, error: "daily_limit", retryAfterMs: DAY_MS }
  }

  const subBucket = bucketStartFor(now, SUB_BUCKET_MS)
  await db
    .insert(rateLimitBuckets)
    .values({
      userId,
      bucketKey: callKey,
      windowStart: subBucket,
      count: 1,
    })
    .onDuplicateKeyUpdate({
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
  await db
    .insert(rateLimitBuckets)
    .values({
      userId,
      bucketKey: TOTAL_BUCKET_KEY,
      windowStart: subBucket,
      count: 1,
    })
    .onDuplicateKeyUpdate({
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })

  return { ok: true }
}
