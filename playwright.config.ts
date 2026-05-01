import { existsSync } from "node:fs"

import { defineConfig } from "@playwright/test"

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
}

const testDbUrl = process.env.DATABASE_URL_TEST ?? ""
const PORT = "4400"
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    // Always start a fresh dev server. Reusing risks picking up an
    // unrelated process (e.g., nginx in front of localhost on a dev box).
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Override anything from .env.local — tests must hit the test DB and
      // the mock LLM provider, never the dev DB or the real Anthropic API.
      DATABASE_URL: testDbUrl,
      ANTHROPIC_API_KEY: "fake",
      ALLOW_TEST_AUTH: "1",
      PORT,
      // Force Auth.js into non-secure-cookie mode. .env.local has
      // AUTH_URL=https://cairn.wizardtools.ai for prod, which makes
      // Auth.js look for __Secure-authjs.session-token. Override here so
      // it uses the plain authjs.session-token name we set in the bypass.
      AUTH_URL: baseURL,
    },
  },
})
