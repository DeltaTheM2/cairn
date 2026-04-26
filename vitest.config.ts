import { existsSync } from "node:fs"
import path from "node:path"
import { defineConfig } from "vitest/config"

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
}

const testDbUrl = process.env.DATABASE_URL_TEST ?? ""

export default defineConfig({
  test: {
    // Run all tests sequentially in one process — server-action tests share
    // a real test DB and stomp on each other if files run in parallel.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    env: {
      // lib/db reads DATABASE_URL at import time; tests need it pointed
      // at the test database, NOT the dev one.
      DATABASE_URL: testDbUrl,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
