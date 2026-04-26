import { existsSync } from "node:fs"
import mysql from "mysql2/promise"

async function main() {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local")
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("✗ DATABASE_URL is not set (define it in .env.local).")
    process.exit(1)
  }

  const conn = await mysql.createConnection(url)
  try {
    const [rows] = await conn.query("SELECT 1 AS ok")
    console.log("✓ MySQL connection ok:", rows)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error("✗ db-check failed:", err)
  process.exit(1)
})
