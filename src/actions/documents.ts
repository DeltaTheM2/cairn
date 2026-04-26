"use server"

import { revalidatePath } from "next/cache"
import { and, asc, desc, eq, isNull } from "drizzle-orm"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { documentInstances, projects, sections } from "@/lib/db/schema"
import { loadQuestionBank, type SupportedDocType } from "@/lib/question-bank"
import {
  createDocumentInputSchema,
  documentIdInputSchema,
  projectScopedListInputSchema,
} from "@/lib/validation/documents"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type DocumentListItem = {
  id: number
  name: string
  docType: string
  questionBankVersion: string
  status: "draft" | "in_progress" | "complete" | "archived"
  createdAt: Date
  updatedAt: Date
}

export type DocumentSection = {
  id: number
  sectionKey: string
  orderIndex: number
  status: "pending" | "in_progress" | "complete"
  hasSoftWarnings: boolean
  title: string
  description: string
}

export type DocumentDetail = {
  id: number
  name: string
  docType: string
  questionBankVersion: string
  status: "draft" | "in_progress" | "complete" | "archived"
  projectId: number
  projectName: string
  sections: DocumentSection[]
}

async function projectIfOwned(projectId: number, userId: string) {
  const [row] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.ownerId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function listDocuments(
  input: unknown,
): Promise<Result<DocumentListItem[]>> {
  const user = await requireUser()
  const parsed = projectScopedListInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const project = await projectIfOwned(parsed.data.projectId, user.id)
  if (!project) return { ok: false, error: "not_found" }

  const rows = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
      docType: documentInstances.docType,
      questionBankVersion: documentInstances.questionBankVersion,
      status: documentInstances.status,
      createdAt: documentInstances.createdAt,
      updatedAt: documentInstances.updatedAt,
    })
    .from(documentInstances)
    .where(
      and(
        eq(documentInstances.projectId, parsed.data.projectId),
        isNull(documentInstances.deletedAt),
      ),
    )
    .orderBy(desc(documentInstances.updatedAt))

  return { ok: true, data: rows }
}

export async function createDocument(
  input: unknown,
): Promise<Result<{ id: number }>> {
  const user = await requireUser()

  const parsed = createDocumentInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const project = await projectIfOwned(parsed.data.projectId, user.id)
  if (!project) return { ok: false, error: "not_found" }

  const bank = loadQuestionBank(parsed.data.docType as SupportedDocType)

  const documentInstanceId = await db.transaction(async (tx) => {
    const inserted = await tx.insert(documentInstances).values({
      projectId: parsed.data.projectId,
      docType: parsed.data.docType,
      name: parsed.data.name,
      questionBankVersion: bank.version,
      status: "draft",
      currentSectionKey: bank.sections[0]?.key ?? null,
    })
    const id = inserted[0].insertId

    if (bank.sections.length > 0) {
      await tx.insert(sections).values(
        bank.sections.map((section, idx) => ({
          documentInstanceId: id,
          sectionKey: section.key,
          orderIndex: idx,
          status: "pending" as const,
        })),
      )
    }

    return id
  })

  revalidatePath(`/app/projects/${parsed.data.projectId}`)
  return { ok: true, data: { id: documentInstanceId } }
}

export async function getDocument(
  input: unknown,
): Promise<Result<DocumentDetail>> {
  const user = await requireUser()
  const parsed = documentIdInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const [row] = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
      docType: documentInstances.docType,
      questionBankVersion: documentInstances.questionBankVersion,
      status: documentInstances.status,
      projectId: documentInstances.projectId,
      projectName: projects.name,
      ownerId: projects.ownerId,
    })
    .from(documentInstances)
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, parsed.data.id),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)

  if (!row || row.ownerId !== user.id) {
    return { ok: false, error: "not_found" }
  }

  const sectionRows = await db
    .select({
      id: sections.id,
      sectionKey: sections.sectionKey,
      orderIndex: sections.orderIndex,
      status: sections.status,
      hasSoftWarnings: sections.hasSoftWarnings,
    })
    .from(sections)
    .where(eq(sections.documentInstanceId, parsed.data.id))
    .orderBy(asc(sections.orderIndex))

  const bank = loadQuestionBank(row.docType as SupportedDocType)
  const meta = new Map(bank.sections.map((s) => [s.key, s]))

  const merged: DocumentSection[] = sectionRows.map((s) => ({
    ...s,
    title: meta.get(s.sectionKey)?.title ?? s.sectionKey,
    description: meta.get(s.sectionKey)?.description ?? "",
  }))

  return {
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      docType: row.docType,
      questionBankVersion: row.questionBankVersion,
      status: row.status,
      projectId: row.projectId,
      projectName: row.projectName,
      sections: merged,
    },
  }
}

async function ownsDocument(documentId: number, userId: string) {
  const [row] = await db
    .select({ projectId: documentInstances.projectId })
    .from(documentInstances)
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, documentId),
        eq(projects.ownerId, userId),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function archiveDocument(input: unknown): Promise<Result<null>> {
  const user = await requireUser()
  const parsed = documentIdInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const owned = await ownsDocument(parsed.data.id, user.id)
  if (!owned) return { ok: false, error: "not_found" }

  await db
    .update(documentInstances)
    .set({ status: "archived" })
    .where(eq(documentInstances.id, parsed.data.id))

  revalidatePath(`/app/projects/${owned.projectId}`)
  revalidatePath(`/app/docs/${parsed.data.id}`)
  return { ok: true, data: null }
}

export async function deleteDocument(input: unknown): Promise<Result<null>> {
  const user = await requireUser()
  const parsed = documentIdInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const owned = await ownsDocument(parsed.data.id, user.id)
  if (!owned) return { ok: false, error: "not_found" }

  await db
    .update(documentInstances)
    .set({ deletedAt: new Date() })
    .where(eq(documentInstances.id, parsed.data.id))

  revalidatePath(`/app/projects/${owned.projectId}`)
  return { ok: true, data: null }
}
