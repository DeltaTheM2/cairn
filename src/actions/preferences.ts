"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth-helpers"
import { db } from "@/lib/db"
import { userPreferences } from "@/lib/db/schema"
import { updatePreferencesInputSchema } from "@/lib/validation/preferences"

type UpdateResult = { ok: true } | { ok: false; error: string }

export async function updateUserPreferences(
  input: unknown,
): Promise<UpdateResult> {
  const user = await requireUser()

  const parsed = updatePreferencesInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid preferences input" }
  }
  if (Object.keys(parsed.data).length === 0) {
    return { ok: true }
  }

  await db
    .insert(userPreferences)
    .values({
      userId: user.id,
      ...parsed.data,
    })
    .onDuplicateKeyUpdate({ set: parsed.data })

  revalidatePath("/app/settings")
  return { ok: true }
}
