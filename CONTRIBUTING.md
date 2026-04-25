# Contributing to Cairn

## The 30-second version

1. Read `AGENTS.md` (and `CLAUDE.md` if you're using Claude Code).
2. Pick a step from `docs/plan.md`.
3. Branch: `feat/<slug>` or `fix/<slug>`.
4. Make the change. Keep PRs small (<400 LoC).
5. Run `pnpm typecheck && pnpm lint && pnpm test` — all must pass.
6. Conventional commit, push, open PR.
7. Green CI required to merge.

## Branching & commits

- **Branches:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/). Examples:
  - `feat(wizard): add chat-mode rendering`
  - `fix(auth): handle expired magic link gracefully`
  - `chore(deps): bump drizzle-orm to 0.40.x`
- **PR title:** matches commit format
- One logical change per commit; one logical feature per PR.

## When to write an ADR

Trigger an ADR for:
- Structural patterns (e.g., "switch to microservices")
- Non-functional requirements with architectural impact (HA, DR, security model changes)
- API contract changes (versioning, breaking changes)
- Vendor / framework choices
- Anything that's hard to reverse later

ADRs go in `docs/adr/`, numbered monotonically. See ADR-0001 for the format.

## What to test

- **Server actions:** unit-test the happy path, the unauth path, the wrong-owner path, and at least one input-validation failure.
- **LLM call sites:** snapshot test against fixture inputs using the mock provider.
- **Wizard happy path:** at least one Playwright e2e test that walks the full flow end-to-end.
- **Schema changes:** generate the migration and verify it applies cleanly to a fresh DB and an existing one.

## What NOT to do

- Don't add a dependency without justifying it in the PR description.
- Don't change the schema without an ADR or spec update.
- Don't edit `prompts/*.md` without flagging the diff explicitly in the PR body — prompt changes are product changes.
- Don't bypass `requireUser()` or input validation in server actions, even "just for now."
- Don't `dangerouslySetInnerHTML` on user content.
- Don't put secrets in `NEXT_PUBLIC_*` env vars.

## Working with Claude Code on this repo

The repo is set up for Claude Code via:

- `AGENTS.md` — operational source of truth (also read by Claude Code)
- `CLAUDE.md` — Claude Code-specific extras

When prompting Claude Code:

1. Tell it which plan step you're on.
2. Tell it to read `AGENTS.md` + `docs/spec.md` + the relevant section of `docs/plan.md` first.
3. Ask for a plan before code on anything beyond a one-line tweak.
4. Review every diff before committing.
5. Run the test gate yourself; don't trust "I'm pretty sure it works."

## Code review

- Self-review your own diff before requesting review.
- Reviewers focus on: correctness, security, test coverage, and convention adherence.
- Reviewers do **not** focus on style — that's prettier's job.
- LGTM in <24h is the team norm; if a PR is blocking work, mention it.
