# Cairn — Product Specification

**Status:** Draft v0.1 (2026-04-25)
**Codename:** spek
**Owner:** Soroush

---

## 1. Vision

Cairn is a self-hosted web app that walks engineers through producing the
software-development documents their projects actually need — PRD, SRS,
ADR, User Stories at MVP, plus arc42, OpenAPI, threat models, runbooks,
and more in v1.1 — by asking targeted questions, judging the adequacy of
answers with a small LLM, coaching the user when answers are weak, and
synthesizing well-formed markdown documents from accumulated answers.

The product theory: structured persistence + enforced rigor + output
consistency beats ad-hoc chats with Claude.ai for any document the team
will maintain past the first week.

The differentiators we're betting on:

1. **Output consistency** — every PRD or SRS produced has the same
   structure, the same level of detail, the same quality bar.
2. **Future expandability** — the docs Cairn produces are good enough
   that a different engineer (or AI agent) picking up the project six
   months later doesn't have to start from scratch.

## 2. Target user

Engineers at our company who use AI coding tools (Claude Code in
particular) and currently struggle to produce documentation that holds
up when somebody else picks up the work.

Out of scope for MVP: external customers, free-tier users, the broader
public.

## 3. Success metrics

**60-day MVP success looks like:**
- ≥3 real production projects have a complete PRD generated through
  Cairn that the project owner considers "the canonical PRD"
- Engineers picking up someone else's Cairn-produced doc report it's
  more useful than the team's previous documentation (ad-hoc subjective
  measure — collected via Slack pulse)
- ≥1 Cairn-produced PRD has been used as input to Claude Code on a
  greenfield build

**90-day expansion success:**
- All four MVP doc types in active use
- v1.1 doc types (arc42 + threat model) shipped and used at least once

## 4. UX architecture

### 4.1 The wizard flow

**Linear, with sections.** Section N must be complete (all questions
answered to adequacy) before section N+1 unlocks. The user can revisit
completed sections at any time without losing progress.

**Two presentation modes** (user preference, persisted):

- **Section mode** — 5–10 questions visible on screen, scrollable, save
  on blur (debounced) — the default
- **Chat mode** — one question at a time, conversational pacing — same
  underlying data, different rendering

Switching modes mid-document is allowed and preserves state.

### 4.2 The adequacy loop

For each answered question, on submit:

1. **Rule check** (instant, free): minimum length, required keywords for
   structured questions, regex for fields like dates/IDs. Defined per
   question in the question bank schema. Fails → display rule reason,
   don't call LLM.

2. **LLM judge** (Haiku 4.5, ~1–2s): if rules pass, call adequacy judge
   with the question, the answer, and the rubric. Returns a 1–5 score
   and structured feedback.

3. **Branch on judge score:**
   - **≥4** → mark answer complete, advance
   - **3** → soft warn; user can advance with a yellow flag in the
     section summary
   - **≤2** → enter coach loop

### 4.3 The coach loop

Triggered on adequacy score ≤2. Up to 3 iterations:

1. Coach LLM (Haiku 4.5) receives the original question, the user's
   answer, and the judge's feedback. Returns: (a) a rephrased question,
   (b) 2–3 concrete examples of good answers, (c) one clarifying
   follow-up question
2. UI shows the rephrasing inline with the original; user revises
3. New answer goes back through rule check + judge
4. After 3 failed coach iterations, soft-warn and let the user advance.
   The flag persists in the section summary and final synthesis is
   informed of it ("the user noted X is uncertain")

### 4.4 The suggester

User-invoked button at the bottom of any section: "Suggest things I'm
missing." Calls Sonnet 4.7 with all section answers as context, returns
a structured list of (a) features the user didn't mention but probably
needs, (b) edge cases not addressed, (c) risks not surfaced. User picks
which to add as new questions/answers in the section.

### 4.5 The synthesizer

Triggered when all sections of a document are complete (or the user
explicitly forces synthesis). Sonnet 4.7 with streaming. Receives all
answers, all section metadata, and the document type's output template.
Produces well-formatted markdown.

The synthesized markdown is reviewable inline in a side-by-side panel
during wizard completion, and is the artifact downloaded on export.

### 4.6 Save & resume

- Auto-save every answer on blur (debounced 800ms) and on explicit
  navigation. No manual save button required.
- "Snapshot" button creates a named, immutable point-in-time copy of
  the document instance. Users can branch from any snapshot in v1.2
  (schema supports it from MVP).
- Closing the browser mid-section preserves draft text in the
  `answers.draft_text` column; on reopen, the draft is restored with a
  visual indicator that it hasn't been judged yet.

### 4.7 Export

Markdown native. PDF and DOCX generated on-demand server-side via
`md-to-pdf` (Pandoc-based) and `markdown-docx`. Download only — no
push-to-GitHub or push-to-Notion in MVP.

## 5. Document types — MVP

Each document type has a question bank stored as JSON at
`/prompts/question-banks/<doc-type>.json`, structured as:

```json
{
  "doc_type": "prd",
  "version": "1",
  "title": "Product Requirements Document",
  "sections": [
    {
      "key": "vision",
      "title": "Vision & Problem",
      "description": "What problem are we solving and for whom?",
      "questions": [
        {
          "key": "problem_statement",
          "prompt": "...",
          "rules": { "min_length": 80, "must_contain_any": ["user", "customer", "engineer"] },
          "rubric": "...",
          "examples": ["...", "..."]
        }
      ]
    }
  ],
  "synthesis_template": "..."
}
```

### 5.1 PRD — Product Requirements Document

Sections: Vision & Problem · Users & Personas · Goals & Non-Goals ·
User Journeys · Functional Requirements · Non-Functional Requirements ·
Constraints & Assumptions · Open Questions · Success Metrics

### 5.2 SRS — Software Requirements Specification

IEEE 830 / ISO 29148 hybrid. Sections: Introduction (Purpose, Scope,
Definitions, References, Overview) · Overall Description (Product
Perspective, Functions, User Classes, Operating Environment,
Constraints, Assumptions) · Specific Requirements (External Interfaces,
Functional, Performance, Logical Database, Design Constraints, System
Attributes)

### 5.3 ADR — Architecture Decision Record

Nygard format. Single-decision granularity (one ADR per decision).
Sections: Title · Status · Context · Decision · Consequences ·
Alternatives Considered

### 5.4 User Stories — INVEST + Given/When/Then

Per-story wizard. Sections: Story Statement (As a / I want / So that) ·
Acceptance Criteria (≥3, Given/When/Then) · Definition of Ready
checklist · Estimation · Dependencies

User stories live inside a parent project but can be exported
individually or as a backlog bundle.

## 6. Document types — v1.1 (post-MVP)

Same shape (question bank JSON + synthesis template + adequacy rubrics).
Listed for forward-design purposes only:

- arc42 + C4 — Software Architecture Document
- OpenAPI 3.x scaffolding — API spec
- IEEE 829 lite — Test Plan
- STRIDE — Threat Model
- Runbook / Playbook
- Definition of Done / Definition of Ready
- Postmortem template

The data model and wizard engine must support these without schema
changes — only adding new question bank JSON files and synthesis
templates.

## 7. Functional requirements (numbered, traceable)

- **FR-1** Users authenticate via Google OAuth or email magic link
  (Auth.js v5).
- **FR-2** Authenticated users can create, list, rename, archive, and
  delete projects they own.
- **FR-3** Users can add documents to a project; each document has a
  type (PRD/SRS/ADR/UserStory) and instance-level metadata.
- **FR-4** Users can walk a wizard through any document, answering
  questions section by section.
- **FR-5** The system judges every submitted answer's adequacy using
  rules first, then LLM judge.
- **FR-6** When judge score ≤2, the system enters coach loop (up to 3
  iterations) with rephrased questions and examples.
- **FR-7** Users can manually invoke the suggester to surface missing
  topics, risks, and edge cases for any section.
- **FR-8** When all sections are complete, users can synthesize the
  document into markdown via streaming LLM call.
- **FR-9** Users can export any synthesized document as markdown, PDF,
  or DOCX (download only, no external push).
- **FR-10** Users can take named snapshots of any document at any time.
- **FR-11** Users can switch between section-mode and chat-mode rendering
  via a per-user preference.
- **FR-12** All LLM calls are logged with cost, latency, and token usage
  per project.
- **FR-13** Each project has a configurable cost ceiling; LLM calls fail
  closed when ceiling is reached.
- **FR-14** Each user has a daily LLM call rate limit (configurable
  globally; default 200 calls/day).
- **FR-15** Users can re-run any section's adequacy judging without
  losing the original answers (e.g., after a prompt update).
- **FR-16** Soft-warned answers are flagged in the section summary and
  in the synthesized output.

## 8. Non-functional requirements

- **NFR-1 Performance:** adequacy check P95 <2s; page load P95 <1s;
  synthesis P95 <30s with streaming first-token <2s.
- **NFR-2 Accessibility:** WCAG 2.2 AA across all pages; tested with
  axe-core in CI.
- **NFR-3 Security:**
  - All LLM calls server-side; API keys never exposed to client
  - Per-user rate limit enforced server-side (DB-backed, sliding window)
  - All server action inputs validated with Zod
  - Markdown sanitized via rehype-sanitize before render
  - Auth on every server action via `requireUser()` helper
  - HTTPS-only in production; HSTS enabled at nginx layer
- **NFR-4 Responsive:** every page works at 375px, 768px, 1024px,
  1280px breakpoints. Mobile is full-feature, not read-only.
- **NFR-5 Theming:** dark mode + light mode + system preference
  detection on every screen.
- **NFR-6 Observability:** Sentry captures unhandled errors and slow
  server actions (>1s); PostHog tracks wizard funnel events and feature
  usage.
- **NFR-7 Cost:** default project budget $5 USD; default daily user
  call cap 200 calls.
- **NFR-8 Deployability:** single `docker-compose` or PM2 deploy on
  wizardtools.ai infra; SSL via existing nginx; build via `pnpm build`
  produces standalone Next.js server.

## 9. Data model

MySQL 8.x. Drizzle ORM for schema + queries. See
`src/lib/db/schema.ts` for the canonical types.

```
users (id, email, name, image, email_verified_at, created_at, updated_at)
accounts, sessions, verification_tokens — Auth.js managed

user_preferences (
  user_id PK FK, wizard_mode ENUM('section','chat') default 'section',
  theme ENUM('system','light','dark') default 'system',
  updated_at
)

projects (
  id, owner_id FK users, name, description,
  status ENUM('active','archived','deleted') default 'active',
  cost_budget_usd DECIMAL(10,4) default 5.0000,
  cost_used_usd DECIMAL(10,4) default 0.0000,
  created_at, updated_at, deleted_at
)

document_instances (
  id, project_id FK, doc_type VARCHAR(32),
  question_bank_version VARCHAR(16) — pinned at create time so prompt
    edits don't break in-progress docs
  status ENUM('draft','in_progress','complete','archived'),
  current_section_key VARCHAR(64),
  parent_snapshot_id FK document_snapshots NULLABLE — for branching, v1.2
  created_at, updated_at, deleted_at
)

sections (
  id, document_instance_id FK, section_key VARCHAR(64),
  status ENUM('pending','in_progress','complete'),
  has_soft_warnings BOOLEAN default false,
  completed_at, created_at, updated_at
  UNIQUE (document_instance_id, section_key)
)

answers (
  id, section_id FK, question_key VARCHAR(64),
  raw_text TEXT,
  draft_text TEXT NULLABLE — unsubmitted draft preserved across sessions
  adequacy_score TINYINT NULLABLE (1–5),
  judge_feedback JSON NULLABLE — { strengths, weaknesses, suggestions }
  llm_suggestions JSON NULLABLE — last suggester output
  revision_count INT default 0,
  is_soft_warned BOOLEAN default false,
  last_judged_at, created_at, updated_at
  UNIQUE (section_id, question_key)
)

document_snapshots (
  id, document_instance_id FK, name VARCHAR(255),
  parent_snapshot_id FK self NULLABLE — branching support
  branch_name VARCHAR(64) NULLABLE — null = mainline
  state_json JSON — full deep-copy of doc + sections + answers at snapshot time
  created_by FK users, created_at
)

document_exports (
  id, document_instance_id FK, format ENUM('md','pdf','docx'),
  file_path VARCHAR(512), generated_at, generated_by FK users
)

question_banks (
  id, doc_type VARCHAR(32), version VARCHAR(16),
  schema_json JSON, is_active BOOLEAN,
  created_at, deprecated_at
  UNIQUE (doc_type, version)
)

llm_call_logs (
  id, project_id FK NULLABLE, document_instance_id FK NULLABLE,
  user_id FK,
  call_type ENUM('judge','coach','suggester','synthesizer'),
  model VARCHAR(64), prompt_version VARCHAR(16),
  tokens_in INT, tokens_out INT, cost_usd DECIMAL(10,6),
  latency_ms INT, status ENUM('ok','error','rate_limited','budget_exceeded'),
  error_message TEXT NULLABLE,
  created_at — indexed for time-series queries
)

rate_limit_buckets (
  user_id FK, bucket_key VARCHAR(64), window_start DATETIME,
  count INT,
  PRIMARY KEY (user_id, bucket_key, window_start)
)
```

**Branching note (v1.2 forward-compat):** snapshots already have
`parent_snapshot_id` and `branch_name`. Branching is "create a new
document_instance whose `parent_snapshot_id` points to the chosen
snapshot." All linear-snapshot paths still work — branching is a
superset.

**Real-time collaboration note (future):** the `answers` table is
amenable to row-level locks (`SELECT ... FOR UPDATE`) for pessimistic
collab. CRDT-based approach would require restructuring. For MVP,
single-author per document; sharing is read-only links in v1.1.

## 10. LLM architecture

### 10.1 Provider abstraction

```ts
// src/lib/llm/provider.ts
export type LLMProvider = {
  name: string
  judge(input: JudgeInput): Promise<JudgeOutput>
  coach(input: CoachInput): Promise<CoachOutput>
  suggest(input: SuggestInput): Promise<SuggestOutput>
  synthesize(input: SynthesizeInput, signal?: AbortSignal): AsyncIterable<string>
}
```

MVP ships `AnthropicProvider`. v1.2 will add `OllamaProvider` running
against the W7900. Selection is via env var `LLM_PROVIDER=anthropic`.

### 10.2 Per-call specifics

| Call | Model | Streaming | Cache | Output |
|---|---|---|---|---|
| Judge | claude-haiku-4-5 | No | System prompt cached | Strict JSON (Zod-validated) |
| Coach | claude-haiku-4-5 | No | None | Strict JSON |
| Suggester | claude-sonnet-4-7 | No | None | Strict JSON |
| Synthesizer | claude-sonnet-4-7 | Yes | None | Markdown text |

### 10.3 Cost tracking

Every call logs `tokens_in × input_price + tokens_out × output_price`
to `llm_call_logs.cost_usd`. Project totals aggregated by trigger.
Pre-call check: `project.cost_used_usd + estimated_cost >
project.cost_budget_usd` → fail closed with user-facing error.

### 10.4 Rate limiting

Sliding-window per user, per call type. Defaults:
- Judge: 60/hour
- Coach: 30/hour
- Suggester: 20/hour
- Synthesizer: 10/hour

Total: 200/day cap as a backstop.

## 11. Security model

See `AGENTS.md` § "Security non-negotiables." Repeated here for spec
completeness:

1. No client-side LLM API key exposure
2. Auth required on every server action via `requireUser()`
3. Zod validation on every server action input
4. Per-user rate limit pre-check on every LLM-triggering action
5. Markdown sanitized via `rehype-sanitize` before render
6. CSRF: rely on Next.js server-action handshake; do not bypass
7. Cost ceiling enforced pre-call
8. Synthesized doc content sanitized before re-feeding into another LLM
   call (prompt injection mitigation)

## 12. Out of scope for MVP

- Real-time collaborative editing (single-author only; design supports
  it later)
- Branching of document versions (snapshots are linear in MVP; schema
  supports branching)
- External integrations (GitHub push, Notion sync, Slack notifications)
- Public/anonymous sharing
- Billing / multi-tenant SaaS
- Custom company-specific templates (v1.1)
- v1.1 doc types (arc42, OpenAPI, threat model, etc.)
- DORA / OKR dashboards
- Mobile native app (responsive web only)
- Local Ollama provider (v1.2)

## 13. Open questions / decisions to revisit

- **OPEN-1:** Resend vs SMTP relay on wizardtools for magic-link email.
  Default to Resend; revisit if cost or latency becomes an issue.
- **OPEN-2:** PostHog self-hosted vs cloud. Default to cloud for MVP;
  switch to self-hosted in v1.1 if data residency matters.
- **OPEN-3:** Should the suggester output be auto-applied or always
  user-curated? MVP: user-curated (safer). Revisit after 30 days of use.
- **OPEN-4:** Snapshot retention policy. MVP: keep all forever. Revisit
  when storage becomes meaningful.

## 14. References

- AGENTS.md — operational conventions
- docs/plan.md — implementation order
- docs/adr/ — decisions made
- prompts/ — LLM prompt templates and question banks
- (External) IEEE 830-1998 / ISO/IEC/IEEE 29148:2011 for SRS structure
- (External) Nygard 2011 for ADR format
- (External) Bill Wake INVEST 2003 for user story criteria
- (External) Anthropic context engineering & prompt caching docs
