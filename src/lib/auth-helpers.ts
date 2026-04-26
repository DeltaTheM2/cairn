import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

/**
 * Returns the current user, or null if no session.
 * Use in pages where unauthenticated viewing is allowed.
 */
export async function getOptionalUser() {
  const session = await auth()
  return session?.user ?? null
}

/**
 * Returns the current user, or redirects to /signin if no session.
 * Use as the FIRST line of every server action that requires auth, and
 * in protected page/layout server components.
 */
export async function requireUser() {
  const user = await getOptionalUser()
  if (!user) {
    redirect("/signin")
  }
  return user
}
