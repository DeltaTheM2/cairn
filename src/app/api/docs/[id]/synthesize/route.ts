import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { and, eq, inArray, isNull } from "drizzle-orm"
import type { NextRequest } from "next/server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  answers,
  documentExports,
  documentInstances,
  projects,
  sections,
} from "@/lib/db/schema"
import {
  preflightSynthesize,
  runSynthesize,
} from "@/lib/llm/calls/synthesizer"
import {
  loadQuestionBank,
  type SupportedDocType,
} from "@/lib/question-bank"
import {
  allSectionsComplete,
  buildSynthesizeInput,
} from "@/lib/wizard/synthesis-input"

type RouteCtx = { params: Promise<{ id: string }> }

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user?.id) return jsonError("unauthenticated", 401)
  const userId = session.user.id

  const { id: idParam } = await ctx.params
  const docId = Number(idParam)
  if (!Number.isInteger(docId) || docId <= 0) {
    return jsonError("invalid_id", 400)
  }

  const [doc] = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
      docType: documentInstances.docType,
      projectId: documentInstances.projectId,
    })
    .from(documentInstances)
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, docId),
        eq(projects.ownerId, userId),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)
  if (!doc) return jsonError("not_found", 404)

  const sectionRows = await db
    .select({
      id: sections.id,
      sectionKey: sections.sectionKey,
      status: sections.status,
    })
    .from(sections)
    .where(eq(sections.documentInstanceId, doc.id))

  if (
    !allSectionsComplete(
      sectionRows.map((r) => ({ key: r.sectionKey, status: r.status })),
    )
  ) {
    return jsonError("sections_incomplete", 409)
  }

  const sectionIds = sectionRows.map((s) => s.id)
  const answerRows = sectionIds.length
    ? await db
        .select({
          sectionId: answers.sectionId,
          questionKey: answers.questionKey,
          rawText: answers.rawText,
          isSoftWarned: answers.isSoftWarned,
          adequacyScore: answers.adequacyScore,
        })
        .from(answers)
        .where(inArray(answers.sectionId, sectionIds))
    : []

  const keyById = new Map(sectionRows.map((r) => [r.id, r.sectionKey]))

  const bank = loadQuestionBank(doc.docType as SupportedDocType)
  const input = buildSynthesizeInput({
    docName: doc.name,
    docType: doc.docType,
    timestampIso: new Date().toISOString(),
    bank,
    answers: answerRows.map((a) => ({
      sectionKey: keyById.get(a.sectionId) ?? "",
      questionKey: a.questionKey,
      rawText: a.rawText ?? "",
      isSoftWarned: a.isSoftWarned,
      adequacyScore: a.adequacyScore,
    })),
  })

  const callCtx = {
    userId,
    projectId: doc.projectId,
    documentInstanceId: doc.id,
  }

  const pre = await preflightSynthesize(callCtx)
  if (!pre.ok) {
    return jsonError(
      pre.error,
      pre.error === "rate_limited" ? 429 : 402,
    )
  }

  const encoder = new TextEncoder()
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(payload: object) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        )
      }

      try {
        for await (const chunk of runSynthesize(input, callCtx)) {
          if (chunk.type === "delta") {
            send({ type: "delta", text: chunk.text })
          } else if (chunk.type === "done") {
            const ts = new Date().toISOString().replace(/[:.]/g, "-")
            const dir = path.join(
              process.cwd(),
              "storage",
              "exports",
              String(doc.id),
            )
            const filePath = path.join(dir, `${ts}.md`)
            let saveError: string | null = null
            try {
              await mkdir(dir, { recursive: true })
              await writeFile(filePath, chunk.fullText, "utf-8")
              await db.insert(documentExports).values({
                documentInstanceId: doc.id,
                format: "md",
                filePath: path.relative(process.cwd(), filePath),
                generatedBy: userId,
              })
            } catch (saveErr) {
              saveError =
                saveErr instanceof Error ? saveErr.message : String(saveErr)
            }
            send({
              type: "done",
              fullText: chunk.fullText,
              saveError,
            })
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        send({
          type: "error",
          error: "synthesize_error",
          message: message.slice(0, 500),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx in front of self-host buffers SSE without this header.
      "X-Accel-Buffering": "no",
    },
  })
}
