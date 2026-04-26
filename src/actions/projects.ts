"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, isNull } from "drizzle-orm"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { projects } from "@/lib/db/schema"
import {
  createProjectInputSchema,
  projectIdInputSchema,
  renameProjectInputSchema,
} from "@/lib/validation/projects"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type ProjectListItem = {
  id: number
  name: string
  description: string | null
  status: "active" | "archived" | "deleted"
  costBudgetUsd: string
  costUsedUsd: string
  createdAt: Date
  updatedAt: Date
}

export async function listProjects(): Promise<Result<ProjectListItem[]>> {
  const user = await requireUser()

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      costBudgetUsd: projects.costBudgetUsd,
      costUsedUsd: projects.costUsedUsd,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerId, user.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt))

  return { ok: true, data: rows }
}

export async function createProject(
  input: unknown,
): Promise<Result<{ id: number }>> {
  const user = await requireUser()

  const parsed = createProjectInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const [result] = await db.insert(projects).values({
    ownerId: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  })

  revalidatePath("/app/projects")
  return { ok: true, data: { id: result.insertId } }
}

export async function renameProject(input: unknown): Promise<Result<null>> {
  const user = await requireUser()

  const parsed = renameProjectInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const result = await db
    .update(projects)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    })
    .where(
      and(
        eq(projects.id, parsed.data.id),
        eq(projects.ownerId, user.id),
        isNull(projects.deletedAt),
      ),
    )

  if (result[0].affectedRows === 0) {
    return { ok: false, error: "not_found" }
  }

  revalidatePath("/app/projects")
  revalidatePath(`/app/projects/${parsed.data.id}`)
  return { ok: true, data: null }
}

export async function archiveProject(input: unknown): Promise<Result<null>> {
  const user = await requireUser()

  const parsed = projectIdInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const result = await db
    .update(projects)
    .set({ status: "archived" })
    .where(
      and(
        eq(projects.id, parsed.data.id),
        eq(projects.ownerId, user.id),
        isNull(projects.deletedAt),
      ),
    )

  if (result[0].affectedRows === 0) {
    return { ok: false, error: "not_found" }
  }

  revalidatePath("/app/projects")
  return { ok: true, data: null }
}

export async function deleteProject(input: unknown): Promise<Result<null>> {
  const user = await requireUser()

  const parsed = projectIdInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }
  }

  const result = await db
    .update(projects)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(
      and(
        eq(projects.id, parsed.data.id),
        eq(projects.ownerId, user.id),
        isNull(projects.deletedAt),
      ),
    )

  if (result[0].affectedRows === 0) {
    return { ok: false, error: "not_found" }
  }

  revalidatePath("/app/projects")
  return { ok: true, data: null }
}
