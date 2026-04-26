import Link from "next/link"
import { FolderOpen, Settings } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { signOut } from "@/lib/auth"
import { requireUser } from "@/lib/auth-helpers"

export default async function AppHome() {
  const user = await requireUser()

  async function handleSignOut() {
    "use server"
    await signOut({ redirectTo: "/" })
  }

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Welcome to Cairn
        </h1>
        <p className="text-muted-foreground text-sm">
          Signed in as <span className="text-foreground">{user.email}</span>
        </p>
        <Link
          href="/app/projects"
          className={buttonVariants({
            size: "lg",
            className: "w-full",
          })}
        >
          <FolderOpen className="h-4 w-4" />
          Projects
        </Link>
        <Link
          href="/app/settings"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className: "w-full",
          })}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <form action={handleSignOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
