/**
 * Cairn — Drizzle MySQL schema
 * ----------------------------
 * Canonical schema for the Cairn application.
 *
 * Conventions:
 *   - DB column names are snake_case; TS field names are camelCase.
 *   - Every user-owned row carries created_at, updated_at, and (where
 *     soft-delete is supported) deleted_at.
 *   - JSON columns use $type<T>() for compile-time safety; runtime
 *     validation happens at the Zod layer at server-action boundaries.
 *   - All FKs include onDelete clauses; default is `restrict` for
 *     ownership chains, `cascade` for child rows.
 *   - Indexes are added for every column used in a WHERE clause in the
 *     known query patterns. Add more as you observe slow queries.
 *
 * Forward-compatibility notes:
 *   - documentInstances.parentSnapshotId enables v1.2 branching without
 *     a schema break.
 *   - answers + sections are amenable to row-level locks for v1.x
 *     real-time collab; no restructuring needed.
 */

import {
  mysqlTable,
  bigint,
  varchar,
  text,
  timestamp,
  json,
  decimal,
  int,
  tinyint,
  boolean,
  mysqlEnum,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core"
import { relations } from "drizzle-orm"
import type { AdapterAccountType } from "next-auth/adapters"

/* ------------------------------------------------------------------ */
/* Auth.js v5 — managed tables (do not rename)                        */
/* ------------------------------------------------------------------ */

export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified", { fsp: 3 }),
  image: varchar("image", { length: 1024 }),
  createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { fsp: 3 })
    .notNull()
    .defaultNow()
    .onUpdateNow(),
})

export const accounts = mysqlTable(
  "accounts",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).$type<AdapterAccountType>().notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    // snake_case TS field names below match what @auth/drizzle-adapter
    // queries by; DB columns stay snake_case as well — no migration delta.
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: int("expires_at"),
    token_type: varchar("token_type", { length: 64 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
)

export const sessions = mysqlTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { fsp: 3 }).notNull(),
})

export const verificationTokens = mysqlTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { fsp: 3 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
)

/* ------------------------------------------------------------------ */
/* Cairn application tables                                            */
/* ------------------------------------------------------------------ */

export const userPreferences = mysqlTable("user_preferences", {
  userId: varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  wizardMode: mysqlEnum("wizard_mode", ["section", "chat"])
    .notNull()
    .default("section"),
  theme: mysqlEnum("theme", ["system", "light", "dark"])
    .notNull()
    .default("system"),
  updatedAt: timestamp("updated_at", { fsp: 3 })
    .notNull()
    .defaultNow()
    .onUpdateNow(),
})

export const projects = mysqlTable(
  "projects",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    ownerId: varchar("owner_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["active", "archived", "deleted"])
      .notNull()
      .default("active"),
    costBudgetUsd: decimal("cost_budget_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("5.0000"),
    costUsedUsd: decimal("cost_used_usd", { precision: 10, scale: 4 })
      .notNull()
      .default("0.0000"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
    deletedAt: timestamp("deleted_at", { fsp: 3 }),
  },
  (t) => ({
    ownerIdx: index("projects_owner_idx").on(t.ownerId),
    statusIdx: index("projects_status_idx").on(t.status),
  }),
)

export const documentInstances = mysqlTable(
  "document_instances",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    projectId: bigint("project_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    docType: varchar("doc_type", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    questionBankVersion: varchar("question_bank_version", {
      length: 16,
    }).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "in_progress",
      "complete",
      "archived",
    ])
      .notNull()
      .default("draft"),
    currentSectionKey: varchar("current_section_key", { length: 64 }),
    /** v1.2 forward-compat: branching point. */
    parentSnapshotId: bigint("parent_snapshot_id", {
      mode: "number",
      unsigned: true,
    }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
    deletedAt: timestamp("deleted_at", { fsp: 3 }),
  },
  (t) => ({
    projectIdx: index("doc_instances_project_idx").on(t.projectId),
    typeIdx: index("doc_instances_type_idx").on(t.docType),
    statusIdx: index("doc_instances_status_idx").on(t.status),
  }),
)

export const sections = mysqlTable(
  "sections",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    documentInstanceId: bigint("document_instance_id", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => documentInstances.id, { onDelete: "cascade" }),
    sectionKey: varchar("section_key", { length: 64 }).notNull(),
    orderIndex: int("order_index").notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "complete"])
      .notNull()
      .default("pending"),
    hasSoftWarnings: boolean("has_soft_warnings").notNull().default(false),
    completedAt: timestamp("completed_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    docKeyUnique: uniqueIndex("sections_doc_key_unique").on(
      t.documentInstanceId,
      t.sectionKey,
    ),
    docIdx: index("sections_doc_idx").on(t.documentInstanceId),
  }),
)

export type JudgeFeedback = {
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  oneLineVerdict: string
}

export type SuggesterOutput = {
  missingFeatures: Array<{
    title: string
    rationale: string
    suggestedQuestion: string
    confidence: "high" | "medium" | "low"
  }>
  edgeCases: Array<{
    title: string
    rationale: string
    suggestedQuestion: string
    confidence: "high" | "medium" | "low"
  }>
  risks: Array<{
    title: string
    rationale: string
    suggestedQuestion: string
    confidence: "high" | "medium" | "low"
  }>
}

export const answers = mysqlTable(
  "answers",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    sectionId: bigint("section_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    questionKey: varchar("question_key", { length: 64 }).notNull(),
    rawText: text("raw_text"),
    /** Unsubmitted draft, preserved across sessions. */
    draftText: text("draft_text"),
    adequacyScore: tinyint("adequacy_score"),
    judgeFeedback: json("judge_feedback").$type<JudgeFeedback>(),
    llmSuggestions: json("llm_suggestions").$type<SuggesterOutput>(),
    revisionCount: int("revision_count").notNull().default(0),
    isSoftWarned: boolean("is_soft_warned").notNull().default(false),
    lastJudgedAt: timestamp("last_judged_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    sectionKeyUnique: uniqueIndex("answers_section_key_unique").on(
      t.sectionId,
      t.questionKey,
    ),
    sectionIdx: index("answers_section_idx").on(t.sectionId),
    softWarnIdx: index("answers_soft_warn_idx").on(t.isSoftWarned),
  }),
)

export const documentSnapshots = mysqlTable(
  "document_snapshots",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    documentInstanceId: bigint("document_instance_id", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => documentInstances.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    parentSnapshotId: bigint("parent_snapshot_id", {
      mode: "number",
      unsigned: true,
    }),
    branchName: varchar("branch_name", { length: 64 }),
    /** Full deep-copy of doc + sections + answers at snapshot time. */
    stateJson: json("state_json").notNull(),
    createdBy: varchar("created_by", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index("snapshots_doc_idx").on(t.documentInstanceId),
    branchIdx: index("snapshots_branch_idx").on(t.branchName),
  }),
)

export const documentExports = mysqlTable(
  "document_exports",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    documentInstanceId: bigint("document_instance_id", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => documentInstances.id, { onDelete: "cascade" }),
    format: mysqlEnum("format", ["md", "pdf", "docx"]).notNull(),
    filePath: varchar("file_path", { length: 512 }).notNull(),
    generatedBy: varchar("generated_by", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    generatedAt: timestamp("generated_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index("exports_doc_idx").on(t.documentInstanceId),
  }),
)

export const questionBanks = mysqlTable(
  "question_banks",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    docType: varchar("doc_type", { length: 32 }).notNull(),
    version: varchar("version", { length: 16 }).notNull(),
    schemaJson: json("schema_json").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    deprecatedAt: timestamp("deprecated_at", { fsp: 3 }),
  },
  (t) => ({
    typeVersionUnique: uniqueIndex("qbanks_type_version_unique").on(
      t.docType,
      t.version,
    ),
    activeIdx: index("qbanks_active_idx").on(t.docType, t.isActive),
  }),
)

export const llmCallLogs = mysqlTable(
  "llm_call_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .primaryKey()
      .autoincrement(),
    projectId: bigint("project_id", { mode: "number", unsigned: true }),
    documentInstanceId: bigint("document_instance_id", {
      mode: "number",
      unsigned: true,
    }),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    callType: mysqlEnum("call_type", [
      "judge",
      "coach",
      "suggester",
      "synthesizer",
    ]).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 16 }).notNull(),
    tokensIn: int("tokens_in").notNull().default(0),
    tokensOut: int("tokens_out").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0.000000"),
    latencyMs: int("latency_ms").notNull().default(0),
    status: mysqlEnum("status", [
      "ok",
      "error",
      "rate_limited",
      "budget_exceeded",
    ]).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("llm_logs_project_idx").on(t.projectId),
    userIdx: index("llm_logs_user_idx").on(t.userId),
    timeIdx: index("llm_logs_time_idx").on(t.createdAt),
    statusIdx: index("llm_logs_status_idx").on(t.status),
  }),
)

export const rateLimitBuckets = mysqlTable(
  "rate_limit_buckets",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bucketKey: varchar("bucket_key", { length: 64 }).notNull(),
    windowStart: timestamp("window_start", { fsp: 3 }).notNull(),
    count: int("count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.bucketKey, t.windowStart] }),
    timeIdx: index("rate_limit_time_idx").on(t.windowStart),
  }),
)

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  projects: many(projects),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  documentInstances: many(documentInstances),
}))

export const documentInstancesRelations = relations(
  documentInstances,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [documentInstances.projectId],
      references: [projects.id],
    }),
    sections: many(sections),
    snapshots: many(documentSnapshots),
    exports: many(documentExports),
  }),
)

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  documentInstance: one(documentInstances, {
    fields: [sections.documentInstanceId],
    references: [documentInstances.id],
  }),
  answers: many(answers),
}))

export const answersRelations = relations(answers, ({ one }) => ({
  section: one(sections, {
    fields: [answers.sectionId],
    references: [sections.id],
  }),
}))
