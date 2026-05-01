import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { and, desc, eq, isNull } from "drizzle-orm"
import { mdToPdf } from "md-to-pdf"
import markdownDocx, { Packer } from "markdown-docx"
import type { NextRequest } from "next/server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { documentExports, documentInstances, projects } from "@/lib/db/schema"

type RouteCtx = { params: Promise<{ id: string; format: string }> }

const FORMATS = ["md", "pdf", "docx"] as const
type Format = (typeof FORMATS)[number]

const CONTENT_TYPES: Record<Format, string> = {
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

function safeFilename(name: string, format: Format): string {
  const base =
    name
      .replace(/[^a-zA-Z0-9._ -]/g, "")
      .trim()
      .slice(0, 80) || "document"
  return `${base}.${format}`
}

/**
 * Download endpoint for a document's synthesized output. Three formats:
 *
 *   md   → serves the latest synthesized markdown verbatim
 *   pdf  → md-to-pdf (puppeteer) on first request, cached on disk + DB
 *   docx → markdown-docx on first request, cached on disk + DB
 *
 * Cache key: an existing pdf/docx export is reused when its generated_at
 * is >= the latest md export's generated_at. Re-synthesize → cache busts.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth()
  if (!session?.user?.id) return jsonError("unauthenticated", 401)
  const userId = session.user.id

  const { id: idParam, format: formatParam } = await ctx.params
  const docId = Number(idParam)
  if (!Number.isInteger(docId) || docId <= 0) {
    return jsonError("invalid_id", 400)
  }
  if (!FORMATS.includes(formatParam as Format)) {
    return jsonError("invalid_format", 400)
  }
  const format = formatParam as Format

  const [doc] = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
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

  const [latestMd] = await db
    .select({
      filePath: documentExports.filePath,
      generatedAt: documentExports.generatedAt,
    })
    .from(documentExports)
    .where(
      and(
        eq(documentExports.documentInstanceId, docId),
        eq(documentExports.format, "md"),
      ),
    )
    .orderBy(desc(documentExports.generatedAt))
    .limit(1)
  if (!latestMd) return jsonError("no_synthesis", 404)

  const cwd = process.cwd()
  const mdAbs = path.isAbsolute(latestMd.filePath)
    ? latestMd.filePath
    : path.join(cwd, latestMd.filePath)

  const headers = {
    "Content-Type": CONTENT_TYPES[format],
    "Content-Disposition": `attachment; filename="${safeFilename(doc.name, format)}"`,
    "Cache-Control": "private, max-age=0, must-revalidate",
  }

  if (format === "md") {
    const content = await readFile(mdAbs, "utf-8")
    return new Response(content, { headers })
  }

  // pdf or docx — try the cache (existing export newer than latest md).
  const [latestSame] = await db
    .select({
      filePath: documentExports.filePath,
      generatedAt: documentExports.generatedAt,
    })
    .from(documentExports)
    .where(
      and(
        eq(documentExports.documentInstanceId, docId),
        eq(documentExports.format, format),
      ),
    )
    .orderBy(desc(documentExports.generatedAt))
    .limit(1)

  let buffer: Buffer
  if (latestSame && latestSame.generatedAt >= latestMd.generatedAt) {
    const abs = path.isAbsolute(latestSame.filePath)
      ? latestSame.filePath
      : path.join(cwd, latestSame.filePath)
    buffer = await readFile(abs)
  } else {
    const md = await readFile(mdAbs, "utf-8")
    if (format === "pdf") {
      const pdf = await mdToPdf({ content: md })
      buffer = Buffer.from(pdf.content)
    } else {
      const docxDoc = await markdownDocx(md)
      buffer = Buffer.from(await Packer.toBuffer(docxDoc))
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const dir = path.join(cwd, "storage", "exports", String(docId))
    const filePath = path.join(dir, `${ts}.${format}`)
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, buffer)
    await db.insert(documentExports).values({
      documentInstanceId: docId,
      format,
      filePath: path.relative(cwd, filePath),
      generatedBy: userId,
    })
  }

  return new Response(new Uint8Array(buffer), { headers })
}
