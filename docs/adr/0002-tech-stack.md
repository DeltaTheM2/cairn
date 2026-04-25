# ADR-0002: Tech Stack for Cairn MVP

**Status:** Accepted
**Date:** 2026-04-25

## Context

Cairn is a self-hosted internal tool for guiding engineers through
producing software documentation via a wizard with LLM-assisted
adequacy judging, coaching, and synthesis. It needs to ship a working
MVP in a single weekend, run on existing wizardtools.ai infrastructure,
and be maintained primarily by a single engineer (with AI agents
assisting). It must be fully responsive (mobile + desktop) with
WCAG 2.2 AA accessibility and dark mode from day one.

Constraints:
- Self-hosted on existing Linux server with MySQL 8 already running
- Single-engineer maintenance burden
- Heavy LLM API usage requires cost discipline
- Must support future swap to local LLM (Ollama on W7900)
- Mobile parity with desktop, not "mobile read-only"

## Decision

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 App Router + React 19 + TS strict | Familiar from CarmaJobs; App Router unifies frontend + backend in one deployable; strict TS catches issues early |
| Styling | Tailwind v4 + shadcn/ui | Accessibility primitives free via Radix; dark mode + theming built in; design tokens make WCAG compliance cheap |
| Backend | Next.js server actions + route handlers | Single deploy target; no CORS; security discipline enforced via repo conventions |
| Database | MySQL 8 + Drizzle ORM (mysql2 driver) | MySQL already running on wizardtools (same instance as CommDesk); Drizzle is the cleanest TS-first ORM with strong type inference |
| Auth | Auth.js v5 + Drizzle adapter (Google + Resend magic link) | Open standard; supports SSO upgrade later; Drizzle adapter avoids parallel ORMs |
| LLM | Anthropic API (Sonnet 4.7 + Haiku 4.5) | Cost-tiered: Haiku for fast/cheap calls (judge, coach), Sonnet for high-quality calls (suggester, synthesizer) |
| Validation | Zod everywhere | Single source of truth for runtime + compile-time types; required at every server action input and LLM JSON output |
| Forms | react-hook-form + Zod resolver | Standard pairing; minimal re-renders; works with shadcn |
| Markdown | react-markdown + rehype-sanitize | Defense against XSS via stored markdown |
| Testing | Vitest (unit) + Playwright (e2e) | Vitest for speed; Playwright for the wizard happy path |
| Observability | Sentry + PostHog | Error capture (Sentry) and product analytics (PostHog) — wired in v1, not MVP |
| Deployment | Next.js standalone build + PM2 + nginx | Matches existing wizardtools deployment patterns; no Docker overhead for single-app server |
| Package manager | pnpm | Faster, less disk usage, stricter than npm |

## Consequences

**Positive:**
- One language (TypeScript) end-to-end reduces context switching
- Single repo, single deploy reduces operational surface
- All security-sensitive code paths (LLM calls, DB writes) live
  server-side by default with the Next.js model
- shadcn + Radix get us 90% of WCAG 2.2 AA for free
- Drizzle's introspection means Claude Code can read the schema and
  generate type-safe queries without prompt-context bloat

**Negative:**
- Server actions can leak attack surface if discipline lapses (auth,
  validation, rate-limit on every action). Mitigated via repo-level
  enforcement in AGENTS.md and lint rules.
- Next.js standalone deploy on PM2 requires manual file-copy step
  for static assets — documented in deploy script
- MySQL has no native pgvector; future semantic search across
  projects will require an external solution (Meilisearch, Typesense,
  or app-level embeddings table)
- Auth.js v5 is post-stable but still evolving; pin to specific
  versions to avoid surprise breakage

## Alternatives Considered

- **Postgres (Neon)**: rejected because we already have MySQL 8 on
  wizardtools and adding a second DB increases ops surface for no MVP
  benefit
- **Separate ASP.NET Core API** (matching CommDesk): rejected because
  the unified Next.js model ships faster and reduces CORS/auth
  complexity at MVP scale; revisit if backend complexity grows
- **Cloudflare Workers + D1** (matching CarmaJobs): rejected because
  self-hosting on wizardtools is a hard requirement and the existing
  MySQL instance is the cheapest data plane
- **Vite + React SPA + separate backend**: rejected because it doubles
  deploy targets and forces explicit API contract maintenance
- **Local Ollama from MVP**: rejected for resource and quality
  reasons; deferred to v1.2 behind the provider abstraction
- **Clerk for auth**: rejected for self-host preference and
  cost-at-scale; Auth.js is good enough and free
- **Drizzle Postgres syntax then migrate later**: rejected as
  premature optimization; MySQL Drizzle is mature
