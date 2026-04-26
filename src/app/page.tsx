import Link from "next/link"

import { ThemeToggle } from "@/components/theme-toggle"
import { buttonVariants } from "@/components/ui/button"
import { getOptionalUser } from "@/lib/auth-helpers"

export default async function HomePage() {
  const user = await getOptionalUser()

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-foreground text-5xl font-semibold tracking-tight sm:text-6xl">
          Cairn
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg">
          Structured persistence and enforced rigor for engineering
          documentation.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {user ? (
          <Link
            href="/app"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Open app
          </Link>
        ) : (
          <Link
            href="/signin"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Sign in
          </Link>
        )}
        <p className="text-muted-foreground text-xs">
          {user
            ? `Signed in as ${user.email}`
            : "Internal — Google or magic link"}
        </p>
      </div>
    </main>
  )
}
