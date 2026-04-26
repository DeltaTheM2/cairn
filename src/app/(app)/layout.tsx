import { requireUser } from "@/lib/auth-helpers"

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser()
  return <>{children}</>
}
