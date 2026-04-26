import { ThemeToggle } from "@/components/theme-toggle"

export default function VerifyRequestPage() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-md flex-col gap-3">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-muted-foreground text-base">
          We sent you a sign-in link. Click it to finish signing in to Cairn.
        </p>
        <p className="text-muted-foreground text-sm">
          You can close this tab — the link will open in a new one.
        </p>
      </div>
    </main>
  )
}
