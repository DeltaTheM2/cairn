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
  archiveDocument,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
} from "@/actions/documents"
import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { documentInstances, projects, sections, users } from "@/lib/db/schema"

const U1 = {
  id: "doc-u1",
  email: "doc-u1@example.com",
  name: "U1",
  image: null,
}
const U2 = {
  id: "doc-u2",
  email: "doc-u2@example.com",
  name: "U2",
  image: null,
}

function authAs(user: typeof U1 | typeof U2) {
  vi.mocked(requireUser).mockResolvedValue(user as never)
}

function authRedirect() {
  vi.mocked(requireUser).mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
}

async function insertProject(ownerId: string, name = "P") {
  const [r] = await db.insert(projects).values({ ownerId, name })
  return r.insertId
}

async function insertDocument(projectId: number, name = "D") {
  const [r] = await db.insert(documentInstances).values({
    projectId,
    docType: "prd",
    name,
    questionBankVersion: "1",
    status: "draft",
  })
  return r.insertId
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  await db.execute(sql`TRUNCATE TABLE sections`)
  await db.execute(sql`TRUNCATE TABLE document_instances`)
  await db.execute(sql`TRUNCATE TABLE projects`)
  await db.execute(sql`TRUNCATE TABLE users`)
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
  await db.insert(users).values([U1, U2])
})

describe("createDocument", () => {
  it("creates a doc and seeds 9 sections from the PRD bank", async () => {
    const projectId = await insertProject(U1.id)
    authAs(U1)

    const r = await createDocument({ projectId, docType: "prd", name: "PRD A" })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const docId = r.data.id
    const sectionRows = await db
      .select({ key: sections.sectionKey, idx: sections.orderIndex })
      .from(sections)
      .where(sql`document_instance_id = ${docId}`)
      .orderBy(sections.orderIndex)
    expect(sectionRows.length).toBe(9)
    expect(sectionRows[0].key).toBe("vision")
    expect(sectionRows.every((r) => r.idx >= 0)).toBe(true)
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(
      createDocument({ projectId: 1, docType: "prd", name: "x" }),
    ).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found when the project belongs to another user", async () => {
    const projectId = await insertProject(U1.id)
    authAs(U2)
    const r = await createDocument({ projectId, docType: "prd", name: "x" })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects unsupported doc types via zod", async () => {
    const projectId = await insertProject(U1.id)
    authAs(U1)
    const r = await createDocument({ projectId, docType: "srs", name: "x" })
    expect(r.ok).toBe(false)
  })

  it("rejects empty name", async () => {
    const projectId = await insertProject(U1.id)
    authAs(U1)
    const r = await createDocument({ projectId, docType: "prd", name: "" })
    expect(r.ok).toBe(false)
  })
})

describe("listDocuments", () => {
  it("returns docs for an owned project, newest first", async () => {
    const projectId = await insertProject(U1.id)
    await insertDocument(projectId, "Old")
    await insertDocument(projectId, "New")

    authAs(U1)
    const r = await listDocuments({ projectId })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.map((d) => d.name)).toEqual(["New", "Old"])
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(listDocuments({ projectId: 1 })).rejects.toThrow(
      "NEXT_REDIRECT",
    )
  })

  it("returns not_found for projects not owned by the user", async () => {
    const projectId = await insertProject(U1.id)
    authAs(U2)
    const r = await listDocuments({ projectId })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input (negative projectId)", async () => {
    authAs(U1)
    const r = await listDocuments({ projectId: -1 })
    expect(r.ok).toBe(false)
  })
})

describe("getDocument", () => {
  it("returns doc + sections for the owner", async () => {
    const projectId = await insertProject(U1.id, "Proj X")
    authAs(U1)
    const created = await createDocument({
      projectId,
      docType: "prd",
      name: "PRD",
    })
    if (!created.ok) throw new Error("setup failed")
    const docId = created.data.id

    const r = await getDocument({ id: docId })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe("PRD")
    expect(r.data.projectName).toBe("Proj X")
    expect(r.data.sections.length).toBe(9)
    expect(r.data.sections[0].title).toBeTruthy()
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(getDocument({ id: 1 })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found for wrong owner", async () => {
    const projectId = await insertProject(U1.id)
    const docId = await insertDocument(projectId)
    authAs(U2)
    const r = await getDocument({ id: docId })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input", async () => {
    authAs(U1)
    const r = await getDocument({ id: "abc" })
    expect(r.ok).toBe(false)
  })
})

describe("archiveDocument", () => {
  it("archives a doc the user owns", async () => {
    const projectId = await insertProject(U1.id)
    const docId = await insertDocument(projectId)
    authAs(U1)
    const r = await archiveDocument({ id: docId })
    expect(r).toEqual({ ok: true, data: null })

    const [row] = await db
      .select({ status: documentInstances.status })
      .from(documentInstances)
      .where(sql`id = ${docId}`)
      .limit(1)
    expect(row.status).toBe("archived")
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(archiveDocument({ id: 1 })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found for wrong owner", async () => {
    const projectId = await insertProject(U1.id)
    const docId = await insertDocument(projectId)
    authAs(U2)
    const r = await archiveDocument({ id: docId })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input", async () => {
    authAs(U1)
    const r = await archiveDocument({ id: 0 })
    expect(r.ok).toBe(false)
  })
})

describe("deleteDocument", () => {
  it("soft-deletes a doc the user owns", async () => {
    const projectId = await insertProject(U1.id)
    const docId = await insertDocument(projectId)
    authAs(U1)
    const r = await deleteDocument({ id: docId })
    expect(r).toEqual({ ok: true, data: null })

    const [row] = await db
      .select({ deletedAt: documentInstances.deletedAt })
      .from(documentInstances)
      .where(sql`id = ${docId}`)
      .limit(1)
    expect(row.deletedAt).not.toBeNull()
  })

  it("redirects when unauthenticated", async () => {
    authRedirect()
    await expect(deleteDocument({ id: 1 })).rejects.toThrow("NEXT_REDIRECT")
  })

  it("returns not_found for wrong owner", async () => {
    const projectId = await insertProject(U1.id)
    const docId = await insertDocument(projectId)
    authAs(U2)
    const r = await deleteDocument({ id: docId })
    expect(r).toEqual({ ok: false, error: "not_found" })
  })

  it("rejects invalid input (string id)", async () => {
    authAs(U1)
    const r = await deleteDocument({ id: "x" })
    expect(r.ok).toBe(false)
  })
})
