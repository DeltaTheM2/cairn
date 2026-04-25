# Cairn

> A self-hosted web app that walks engineers through producing software
> documentation (PRD, SRS, ADR, User Stories) via guided wizards with
> LLM-judged adequacy, coaching, and synthesis.

**Internal codename:** spek
**Status:** Pre-MVP build (April 2026)

## Quick start

```bash
pnpm install
cp .env.example .env.local      # fill in values
pnpm db:migrate                  # apply schema
pnpm db:seed                     # load question banks
pnpm dev                         # http://localhost:3000
```

## A note on the gitignored files

`AGENTS.md`, `CLAUDE.md`, `KICKOFF-PROMPT.md`, `/prompts/`, and
`/docs/plan.md` are intentionally gitignored — they contain agent
context and prompt engineering we keep private.

This means:

- Cloning this repo from GitHub will not include those files.
- The runtime app reads `/prompts/*.md` and `/prompts/question-banks/*.json`
  on boot, so a fresh clone won't run until those are restored.
- Deploying via `git pull` on the server requires a separate step to
  copy the private files up (e.g., `rsync ./prompts/ ./AGENTS.md
  ./CLAUDE.md user@host:/path/to/cairn/`).
- The canonical copies live wherever the project owner keeps them
  (local-only by default; consider a private companion repo if more
  than one developer needs them).

## Documentation map

- **[`AGENTS.md`](./AGENTS.md)** — operational conventions, commands, and rules. Read this first if you're new to the repo (human or agent).
- **[`CLAUDE.md`](./CLAUDE.md)** — Claude Code-specific extras layered on top of `AGENTS.md`.
- **[`docs/spec.md`](./docs/spec.md)** — canonical product specification.
- **[`docs/plan.md`](./docs/plan.md)** — ordered implementation plan with explicit step-by-step prompts.
- **[`docs/adr/`](./docs/adr/)** — architecture decision records (Nygard format).
- **[`prompts/`](./prompts/)** — version-controlled LLM prompt templates and question banks.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · MySQL 8 · Drizzle ORM · Auth.js v5 · Anthropic API (Sonnet 4.7 + Haiku 4.5) · Vitest · Playwright · PM2 + nginx (self-hosted)

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Short version: branch, conventional commits, small PRs, green CI required, ADR for any architecturally significant change.

## License

Proprietary — internal use only.
