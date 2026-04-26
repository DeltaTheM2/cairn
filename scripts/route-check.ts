/**
 * Route smoke-test. Probes every page route + the Auth.js JSON endpoints
 * and reports per-route status. Useful before deploys to confirm the
 * auth gate fires and authed routes render.
 *
 * Usage:
 *   pnpm route-check                    # against http://localhost:3000
 *   BASE_URL=http://localhost:3002 pnpm route-check
 *   BASE_URL=https://cairn.wizardtools.ai pnpm route-check
 *
 * The script seeds a temporary DB session, hits every route both
 * unauthenticated and with that session cookie, and cleans up the row
 * regardless of pass/fail.
 */

import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
}

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000"

type Probe = {
  path: string
  expectUnauthCode: number
  expectAuthCode: number
  expectAuthH1?: string
}

const PROBES: Probe[] = [
  {
    path: "/",
    expectUnauthCode: 200,
    expectAuthCode: 200,
    expectAuthH1: "Cairn",
  },
  // /signin bounces authed users to /app on purpose.
  { path: "/signin", expectUnauthCode: 200, expectAuthCode: 307 },
  { path: "/verify-request", expectUnauthCode: 200, expectAuthCode: 200 },
  {
    path: "/app",
    expectUnauthCode: 307,
    expectAuthCode: 200,
    expectAuthH1: "Welcome to Cairn",
  },
  {
    path: "/app/settings",
    expectUnauthCode: 307,
    expectAuthCode: 200,
    expectAuthH1: "Settings",
  },
  {
    path: "/app/projects",
    expectUnauthCode: 307,
    expectAuthCode: 200,
    expectAuthH1: "Projects",
  },
  {
    path: "/app/projects/999999999",
    expectUnauthCode: 307,
    expectAuthCode: 404,
  },
]

const AUTHJS_PROBES = [
  { path: "/api/auth/csrf", contains: "csrfToken" },
  { path: "/api/auth/session", contains: null },
  { path: "/api/auth/providers", contains: "google" },
]

type Result = { path: string; ok: boolean; detail: string }

async function probe(
  path: string,
  cookie: string | null,
): Promise<{ status: number; redirect: string | null; body: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : undefined,
  })
  return {
    status: res.status,
    redirect: res.headers.get("location"),
    body: await res.text(),
  }
}

function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  return m ? m[1].trim() : null
}

async function main() {
  const { db, pool } = await import("../src/lib/db/index")
  const { users, sessions } = await import("../src/lib/db/schema")
  const { eq } = await import("drizzle-orm")

  const userId = `smoke-${Date.now()}`
  const token = randomUUID()
  const expires = new Date(Date.now() + 60 * 60 * 1000)

  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    name: "Smoke Test",
  })
  await db.insert(sessions).values({
    sessionToken: token,
    userId,
    expires,
  })

  const cookie = `authjs.session-token=${token}`
  const results: Result[] = []

  try {
    console.log(`probing ${BASE_URL}\n`)

    for (const p of PROBES) {
      const unauth = await probe(p.path, null)
      const ok1 = unauth.status === p.expectUnauthCode
      results.push({
        path: `${p.path} (unauth)`,
        ok: ok1,
        detail: ok1
          ? `${unauth.status}${unauth.redirect ? ` -> ${unauth.redirect}` : ""}`
          : `expected ${p.expectUnauthCode}, got ${unauth.status}`,
      })

      const authed = await probe(p.path, cookie)
      const codeOk = authed.status === p.expectAuthCode
      const h1 = extractH1(authed.body)
      const h1Ok = !p.expectAuthH1 || h1 === p.expectAuthH1
      const ok2 = codeOk && h1Ok
      results.push({
        path: `${p.path} (auth)`,
        ok: ok2,
        detail: ok2
          ? `${authed.status}${h1 ? ` "${h1}"` : ""}`
          : `expected ${p.expectAuthCode}${p.expectAuthH1 ? ` h1="${p.expectAuthH1}"` : ""}, got ${authed.status} h1="${h1 ?? ""}"`,
      })
    }

    for (const ap of AUTHJS_PROBES) {
      const r = await probe(ap.path, null)
      const codeOk = r.status === 200
      const bodyOk = !ap.contains || r.body.includes(ap.contains)
      const ok = codeOk && bodyOk
      results.push({
        path: ap.path,
        ok,
        detail: ok
          ? `${r.status}${ap.contains ? ` contains "${ap.contains}"` : ""}`
          : `${r.status} body="${r.body.slice(0, 80)}"`,
      })
    }
  } finally {
    await db.delete(sessions).where(eq(sessions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
    await pool.end()
  }

  let failed = 0
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗"
    console.log(`  ${mark} ${r.path.padEnd(38)} ${r.detail}`)
    if (!r.ok) failed++
  }
  console.log(
    `\n${results.length - failed}/${results.length} ok` +
      (failed ? ` (${failed} failed)` : ""),
  )
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
