import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
import { auth, signIn } from "@/lib/auth"

export default async function SignInPage() {
  const session = await auth()
  if (session?.user) redirect("/app")

  async function continueWithGoogle() {
    "use server"
    await signIn("google", { redirectTo: "/app" })
  }

  async function sendMagicLink(formData: FormData) {
    "use server"
    await signIn("resend", formData)
  }

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Sign in to Cairn
          </h1>
          <p className="text-muted-foreground text-sm">
            Continue with Google or get a magic link by email.
          </p>
        </div>

        <form action={continueWithGoogle}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Continue with Google
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs tracking-wider uppercase">
            or
          </span>
          <div className="bg-border h-px flex-1" />
        </div>

        <form action={sendMagicLink} className="flex flex-col gap-3">
          <Input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            aria-label="Email address"
          />
          <Button type="submit" size="lg" className="w-full">
            Email me a magic link
          </Button>
        </form>
      </div>
    </main>
  )
}
