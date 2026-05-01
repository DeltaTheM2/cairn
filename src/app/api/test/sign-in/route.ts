import { randomBytes } from "node:crypto"

import { eq } from "drizzle-orm"
import { cookies } from "next/headers"

import { db } from "@/lib/db"
import { sessions, users } from "@/lib/db/schema"

/**
 * Belt-and-suspenders gate: every guard must be true to enable the bypass.
 *
 *   1. NODE_ENV is not 'production'
 *   2. DATABASE_URL string contains 'test' (so even a misconfigured staging
 *      env can't turn this on by accident)
 *   3. ALLOW_TEST_AUTH=1 is explicitly set (must be set in playwright env or
 *      a dedicated test runner; nothing in deployed configs sets this)
 */
function isTestBypassAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false
  if (!process.env.DATABASE_URL?.includes("test")) return false
  if (process.env.ALLOW_TEST_AUTH !== "1") return false
  return true
}

/**
 * Test-only auth bypass. Upserts a user by email, creates a database
 * session, and sets the authjs.session-token cookie. Used by the
 * Playwright smoke test to skip the magic-link round-trip. Returns 404
 * (not 403) when disabled so the route is indistinguishable from
 * non-existent in any deployed environment.
 */
export async function POST(req: Request) {
  if (!isTestBypassAllowed()) {
    return Response.json({ error: "not_found" }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string
    name?: string
  }
  const email = typeof body.email === "string" ? body.email : null
  const name = typeof body.name === "string" ? body.name : "Test User"
  if (!email) {
    return Response.json({ error: "email_required" }, { status: 400 })
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  let userId: string
  if (existing.length === 0) {
    userId = randomBytes(16).toString("hex")
    await db.insert(users).values({
      id: userId,
      email,
      name,
    })
  } else {
    userId = existing[0].id
  }

  const sessionToken = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    sessionToken,
    userId,
    expires,
  })

  const cookieStore = await cookies()
  cookieStore.set({
    name: "authjs.session-token",
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires,
  })

  // sessionToken is also returned in the JSON so Playwright tests can
  // add it explicitly via page.context().addCookies(...) — page.request
  // doesn't reliably propagate Set-Cookie through HttpOnly into the
  // page's navigation cookie jar.
  return Response.json({
    ok: true,
    userId,
    sessionToken,
    expiresIso: expires.toISOString(),
  })
}
