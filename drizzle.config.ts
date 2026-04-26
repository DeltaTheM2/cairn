import { existsSync } from "node:fs"

import { defineConfig } from "drizzle-kit"

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
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
