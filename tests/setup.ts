import { migrate } from "drizzle-orm/mysql2/migrator"
import { afterAll, beforeAll } from "vitest"

import { db, pool } from "@/lib/db"

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error(
      "Vitest is pointing at a non-test database. Set DATABASE_URL_TEST in " +
        ".env.local to a database whose name contains 'test' before running tests.",
    )
  }
  await migrate(db, { migrationsFolder: "./drizzle" })
})

afterAll(async () => {
  await pool.end()
})
