import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"

import * as schema from "./schema"

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Define it in .env.local (see .env.example).",
  )
}

export const pool = mysql.createPool({
  uri: url,
  connectionLimit: 10,
  // mysql2 returns JSON columns as raw strings to ad-hoc text-protocol
  // queries unless we typeCast them. Drizzle uses prepared statements
  // (binary protocol) so this typeCast doesn't affect Drizzle reads —
  // those are handled via parseMaybeJson at the read boundary. The
  // typeCast remains for raw conn.execute() calls (scripts, debug).
  typeCast(field, next) {
    if (field.type === "JSON") {
      const s = field.string()
      if (s == null) return null
      try {
        return JSON.parse(s)
      } catch {
        return s
      }
    }
    return next()
  },
})

/**
 * Drizzle's mysql2 binary-protocol reads bypass the pool's typeCast,
 * so JSON columns come back as raw strings. Use this at every read
 * boundary where a JSON column flows into application code that
 * accesses nested fields. Already-parsed objects pass through unchanged
 * so this is safe to call defensively.
 */
export function parseMaybeJson<T>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value as T
}

export const db = drizzle(pool, {
  schema,
  mode: "default",
})

export type Db = typeof db
