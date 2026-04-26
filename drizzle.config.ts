import { existsSync, readFileSync } from "node:fs"

import { defineConfig } from "drizzle-kit"

// drizzle-kit auto-loads `.env` before evaluating this file, and Node's
// `process.loadEnvFile` won't override values that are already set. So we
// parse `.env.local` ourselves and force the values in — `.env.local` wins
// over `.env`, matching the loading order Next.js uses at runtime.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
    process.env[key] = value
  }
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
})
