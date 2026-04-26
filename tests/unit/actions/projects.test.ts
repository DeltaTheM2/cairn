import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn(),
  getOptionalUser: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

import {
  archiveProject,
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from "@/actions/projects"
import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { projects, users } from "@/lib/db/schema"

const U1 = { id: "u1", email: "u1@example.com", name: "User 1", image: null }
const U2 = { id: "u2", email: "u2@example.com", name: "User 2", image: null }

function authAs(user: typeof U1 | typeof U2) {
  vi.mocked(requireUser).mockResolvedValue(user as never)
}

function authRedirect() {
  vi.mocked(requireUser).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
}

async function insertProject(ownerId: string, name = "Test Project") {
  const [r] = await db
    .insert(projects)
    .values({ ownerId, name, description: "desc" })
  return r.insertId
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  await db.execute(sql`TRUNCATE TABLE projects`)
  await db.execute(sql`TRUNCATE TABLE users`)
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
  await db.insert(users).values([U1, U2])
})

describe("createProject", () => {
  it("creates a project for the authed user", async () => {
    authAs(U1)
    const r = await createProject({ name: "My PRD", description: "x" })
    expect(r).toEqual({ ok: true, data: { id: expect.any(Number) } })
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(createProject({ name: "x" })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("rejects invalid input (empty name)", async () => {
    authAs(U1)
    const r = await createProject({ name: "" })
    expect(r.ok).toBe(false)
  })
})

describe("listProjects", () => {
  it("returns only the authed user's non-deleted projects", async () => {
    await insertProject(U1.id, "Mine A")
    await insertProject(U1.id, "Mine B")
    await insertProject(U2.id, "Theirs")

    authAs(U1)
    const r = await listProjects()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.map((p) => p.name).sort()).toEqual(["Mine A", "Mine B"])
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(listProjects()).rejects.toThrow("NEXT_REDIRECT")
  })
})

describe("renameProject", () => {
  it("renames a project the user owns", async () => {
    const id = await insertProject(U1.id)
    authAs(U1)
    const r = await renameProject({ id, name: "Renamed", description: "y" })
    expect(r).toEqual({ ok: true, data: null })

    const [row] = await db
      .select()
      .from(projects)
      .where(sql`id = ${id}`)
      .limit(1)
    expect(row.name).toBe("Renamed")
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(renameProject({ id: 1, name: "x" })).rejects.toThrow(
      "NEXT_REDIRECT",
    )
  })

  it("returns not_found when the project belongs to another user", async () => {
    const id = await insertProject(U1.id)
    authAs(U2)
    const r = await renameProject({ id, name: "Hijack" })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input (empty name)", async () => {
    const id = await insertProject(U1.id)
    authAs(U1)
    const r = await renameProject({ id, name: "" })
    expect(r.ok).toBe(false)
  })
})

describe("archiveProject", () => {
  it("archives a project the user owns", async () => {
    const id = await insertProject(U1.id)
    authAs(U1)
    const r = await archiveProject({ id })
    expect(r).toEqual({ ok: true, data: null })

    const [row] = await db
      .select()
      .from(projects)
      .where(sql`id = ${id}`)
      .limit(1)
    expect(row.status).toBe("archived")
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(archiveProject({ id: 1 })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found for wrong owner", async () => {
    const id = await insertProject(U1.id)
    authAs(U2)
    const r = await archiveProject({ id })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input (negative id)", async () => {
    authAs(U1)
    const r = await archiveProject({ id: -1 })
    expect(r.ok).toBe(false)
  })
})

describe("deleteProject", () => {
  it("soft-deletes a project the user owns", async () => {
    const id = await insertProject(U1.id)
    authAs(U1)
    const r = await deleteProject({ id })
    expect(r).toEqual({ ok: true, data: null })

    const [row] = await db
      .select()
      .from(projects)
      .where(sql`id = ${id}`)
      .limit(1)
    expect(row.status).toBe("deleted")
    expect(row.deletedAt).not.toBeNull()
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(deleteProject({ id: 1 })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found for wrong owner", async () => {
    const id = await insertProject(U1.id)
    authAs(U2)
    const r = await deleteProject({ id })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input (string id)", async () => {
    authAs(U1)
    const r = await deleteProject({ id: "not-a-number" })
    expect(r.ok).toBe(false)
  })
})
