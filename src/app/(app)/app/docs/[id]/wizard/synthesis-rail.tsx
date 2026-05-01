"use client"

import * as React from "react"
import { Loader2, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Status =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "streaming"; text: string }
  | { kind: "done"; text: string; saveError: string | null }
  | { kind: "error"; message: string }

type Props = {
  documentId: number
  allComplete: boolean
}

export function SynthesisRail({ documentId, allComplete }: Props) {
  const [status, setStatus] = React.useState<Status>({ kind: "idle" })
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  async function start() {
    if (!allComplete) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setStatus({ kind: "starting" })
    try {
      const res = await fetch(`/api/docs/${documentId}/synthesize`, {
        method: "POST",
        signal: ac.signal,
      })
      if (!res.ok) {
        const data = (await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string
        }
        setStatus({
          kind: "error",
          message: data.error ?? `HTTP ${res.status}`,
        })
        return
      }
      const reader = res.body?.getReader()
      if (!reader) {
        setStatus({ kind: "error", message: "no_stream_body" })
        return
      }

      const decoder = new TextDecoder()
      let buf = ""
      let acc = ""
      setStatus({ kind: "streaming", text: "" })

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const event = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 2)
          if (!event.startsWith("data: ")) continue
          const json = event.slice(6)
          let payload: {
            type?: string
            text?: string
            fullText?: string
            error?: string
            message?: string
            saveError?: string | null
          }
          try {
            payload = JSON.parse(json)
          } catch {
            continue
          }
          if (payload.type === "delta" && typeof payload.text === "string") {
            acc += payload.text
            setStatus({ kind: "streaming", text: acc })
          } else if (
            payload.type === "done" &&
            typeof payload.fullText === "string"
          ) {
            setStatus({
              kind: "done",
              text: payload.fullText,
              saveError: payload.saveError ?? null,
            })
          } else if (payload.type === "error") {
            setStatus({
              kind: "error",
              message: payload.message ?? payload.error ?? "synthesize_error",
            })
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return
      const message = err instanceof Error ? err.message : "synthesize_failed"
      setStatus({ kind: "error", message })
    }
  }

  const isStreaming = status.kind === "starting" || status.kind === "streaming"
  const previewText =
    status.kind === "streaming" || status.kind === "done" ? status.text : ""

  return (
    <aside className="flex flex-col gap-3">
      <h2 className="text-foreground text-sm font-semibold tracking-tight">
        Synthesis preview
      </h2>

      {!allComplete ? (
        <p className="text-muted-foreground text-xs">
          Complete every section to enable synthesis.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={start}
            disabled={isStreaming}
            className="w-full"
          >
            {isStreaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status.kind === "starting" ? "Starting…" : "Streaming…"}
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                {status.kind === "done" ? "Re-synthesize" : "Synthesize"}
              </>
            )}
          </Button>
          {status.kind === "error" ? (
            <p className="text-destructive text-xs">{status.message}</p>
          ) : null}
          {status.kind === "done" && status.saveError ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Saved-to-disk failed: {status.saveError}
            </p>
          ) : null}
          {status.kind === "done" && !status.saveError ? (
            <p className="text-muted-foreground text-xs">
              Saved as markdown export.
            </p>
          ) : null}
        </div>
      )}

      {previewText ? (
        <pre
          className={cn(
            "border-border bg-muted/30 max-h-[60vh] overflow-auto rounded-md border p-3",
            "text-foreground whitespace-pre-wrap break-words font-mono text-xs",
          )}
        >
          {previewText}
        </pre>
      ) : null}
    </aside>
  )
}
