# ADR-0001: Record Architecture Decisions

**Status:** Accepted
**Date:** 2026-04-25

## Context

We need a lightweight, version-controlled record of architectural
decisions made on this project. Without it, decisions are lost in chat
logs and PR descriptions, and future maintainers (human or AI) have to
reverse-engineer intent from code.

## Decision

We will use Architecture Decision Records (ADRs) per Michael Nygard's
2011 format.

- ADRs live under `docs/adr/`
- Filename pattern: `NNNN-kebab-case-title.md`
- Numbering is monotonic; never reused
- Status lifecycle: Proposed → Accepted → Deprecated → Superseded
- An ADR is never edited after acceptance except to change its status
  (e.g., to Superseded). Subsequent decisions are written as new ADRs
  that reference the ones they supersede.
- Each ADR has these sections: Context, Decision, Consequences,
  Alternatives Considered

## Consequences

- New contributors and AI agents have a clear record of why the
  codebase is the way it is
- ADR creation has minor overhead — should be triggered by
  architecturally significant decisions only (structural patterns,
  non-functional requirements, vendor/framework choices, things hard
  to reverse)
- The append-only discipline means we accumulate a history that
  reflects how thinking evolved, not just the current state

## Alternatives Considered

- **No ADRs**: rejected; institutional memory loss is the main
  motivator
- **Wiki-based decision log**: rejected; lives outside the repo,
  drifts from code reality, AI agents won't read it
- **GitHub Discussions**: rejected; same reason as wiki, plus poor
  archival format
