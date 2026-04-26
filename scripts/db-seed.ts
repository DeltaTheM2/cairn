/**
 * Question-bank seeder. Reads every JSON under prompts/question-banks/,
 * Zod-validates against the canonical schema, and upserts into the
 * question_banks table by (doc_type, version) — idempotent: re-running
 * with the same JSON is a no-op aside from refreshing schema_json and
 * is_active.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local")
}

async function main() {
  const { db, pool } = await import("../src/lib/db/index")
  const { questionBanks } = await import("../src/lib/db/schema")
  const { questionBankSchema } =
    await import("../src/lib/validation/question-bank")

  const dir = path.resolve("prompts/question-banks")
  if (!existsSync(dir)) {
    console.error(`✗ ${dir} not found`)
    process.exit(1)
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  if (files.length === 0) {
    console.error(`✗ no .json files under ${dir}`)
    process.exit(1)
  }

  console.log(`seeding ${files.length} question bank(s) from ${dir}`)

  let seeded = 0
  try {
    for (const file of files) {
      const raw = readFileSync(path.join(dir, file), "utf-8")
      let json: unknown
      try {
        json = JSON.parse(raw)
      } catch (err) {
        console.error(`  ✗ ${file}: invalid JSON — ${(err as Error).message}`)
        process.exit(1)
      }

      const parsed = questionBankSchema.safeParse(json)
      if (!parsed.success) {
        console.error(
          `  ✗ ${file}: schema validation failed —`,
          parsed.error.issues[0]?.message,
          "at",
          parsed.error.issues[0]?.path.join("."),
        )
        process.exit(1)
      }
      const bank = parsed.data

      await db
        .insert(questionBanks)
        .values({
          docType: bank.doc_type,
          version: bank.version,
          schemaJson: bank,
          isActive: true,
        })
        .onDuplicateKeyUpdate({
          set: {
            schemaJson: bank,
            isActive: true,
            deprecatedAt: null,
          },
        })

      console.log(
        `  ✓ ${file} — ${bank.doc_type} v${bank.version} (${bank.sections.length} sections)`,
      )
      seeded++
    }
  } finally {
    await pool.end()
  }

  console.log(`\nseeded ${seeded}/${files.length} bank(s)`)
}

main().catch((err) => {
  console.error("✗ seed failed:", err)
  process.exit(1)
})
