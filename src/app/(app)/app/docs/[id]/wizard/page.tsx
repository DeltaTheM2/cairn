import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { ChevronLeft } from "lucide-react"

import { WizardChatShell } from "@/app/(app)/app/docs/[id]/wizard/wizard-chat-shell"
import { WizardShell } from "@/app/(app)/app/docs/[id]/wizard/wizard-shell"
import { buttonVariants } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { requireUser } from "@/lib/auth-helpers"
import { db, parseMaybeJson } from "@/lib/db"
import {
  answers,
  documentInstances,
  projects,
  sections,
  userPreferences,
} from "@/lib/db/schema"
import { loadQuestionBank, type SupportedDocType } from "@/lib/question-bank"

export default async function WizardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const [doc] = await db
    .select({
      id: documentInstances.id,
      name: documentInstances.name,
      docType: documentInstances.docType,
      questionBankVersion: documentInstances.questionBankVersion,
      status: documentInstances.status,
      projectId: documentInstances.projectId,
      projectName: projects.name,
      ownerId: projects.ownerId,
    })
    .from(documentInstances)
    .innerJoin(projects, eq(projects.id, documentInstances.projectId))
    .where(
      and(
        eq(documentInstances.id, id),
        isNull(documentInstances.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1)

  if (!doc || doc.ownerId !== user.id) notFound()

  const bank = loadQuestionBank(doc.docType as SupportedDocType)

  const sectionRows = await db
    .select({
      id: sections.id,
      sectionKey: sections.sectionKey,
      orderIndex: sections.orderIndex,
      status: sections.status,
      hasSoftWarnings: sections.hasSoftWarnings,
    })
    .from(sections)
    .where(eq(sections.documentInstanceId, doc.id))
    .orderBy(sections.orderIndex)

  const sectionIds = sectionRows.map((s) => s.id)
  const answerRows = sectionIds.length
    ? await db
        .select({
          sectionId: answers.sectionId,
          questionKey: answers.questionKey,
          rawText: answers.rawText,
          draftText: answers.draftText,
          adequacyScore: answers.adequacyScore,
          judgeFeedback: answers.judgeFeedback,
          isSoftWarned: answers.isSoftWarned,
          revisionCount: answers.revisionCount,
        })
        .from(answers)
        .where(inArray(answers.sectionId, sectionIds))
    : []

  const [prefs] = await db
    .select({ wizardMode: userPreferences.wizardMode })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)
  const wizardMode = prefs?.wizardMode ?? "section"

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/app/docs/${doc.id}`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ChevronLeft className="h-4 w-4" />
          {doc.name}
        </Link>
        <ThemeToggle />
      </div>

      {wizardMode === "chat" ? (
        <WizardChatShell
          documentId={doc.id}
          documentName={doc.name}
          bank={bank}
          sections={sectionRows.map((s) => ({
            id: s.id,
            key: s.sectionKey,
            orderIndex: s.orderIndex,
            status: s.status,
            hasSoftWarnings: s.hasSoftWarnings,
          }))}
          answers={answerRows.map((a) => ({
            sectionId: a.sectionId,
            questionKey: a.questionKey,
            rawText: a.rawText ?? "",
            draftText: a.draftText ?? "",
            isSoftWarned: a.isSoftWarned,
            adequacyScore: a.adequacyScore,
            judgeFeedback: parseMaybeJson(a.judgeFeedback),
          }))}
        />
      ) : (
        <WizardShell
          documentId={doc.id}
          documentName={doc.name}
          bank={bank}
          sections={sectionRows.map((s) => ({
            id: s.id,
            key: s.sectionKey,
            orderIndex: s.orderIndex,
            status: s.status,
            hasSoftWarnings: s.hasSoftWarnings,
          }))}
          answers={answerRows.map((a) => ({
            sectionId: a.sectionId,
            questionKey: a.questionKey,
            rawText: a.rawText ?? "",
            draftText: a.draftText ?? "",
            isSoftWarned: a.isSoftWarned,
            adequacyScore: a.adequacyScore,
            judgeFeedback: parseMaybeJson(a.judgeFeedback),
          }))}
        />
      )}
    </main>
  )
}
