import { ThemeToggle } from "@/components/theme-toggle"

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <h1 className="text-foreground text-5xl font-semibold tracking-tight sm:text-6xl">
        Cairn
      </h1>
      <p className="text-muted-foreground max-w-md text-base sm:text-lg">
        Structured persistence and enforced rigor for engineering documentation.
      </p>
    </main>
  )
}
