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
  // mysql2 returns JSON columns as raw strings unless we typeCast them.
  // Without this, code that reads a JSON column (judgeFeedback,
  // llmSuggestions, document_snapshots.stateJson) gets a string and any
  // attempt to access nested fields blows up — caught the wizard at
  // page-load time when re-loading a doc with prior judge results.
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

export const db = drizzle(pool, {
  schema,
  mode: "default",
})

export type Db = typeof db
