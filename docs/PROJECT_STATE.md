# PROJECT_STATE.md

<!--
Template: replace sections in place; do not append a phase diary. Keep this file <=120 lines.
Sections: Current objective / Decisions in effect / Constraints / Open questions / Next action / Do-not-repeat.
Freshness rule: if the newest date in this file is more than two weeks old, treat the file as
stale — check docs/program/final-ux-loop.md §6 and recent merged PRs before trusting any claim here.
-->

## Current objective

**The Final UX Loop is the governing program** (`docs/program/final-ux-loop.md`, owner directive 2026-07-26): while it runs, the board's priority order comes from it, and new feature work is frozen (program rule R8) except 737-A durability slices (issue #737's device-durability work — the Trust campaign's follow-through) and P0 production incidents. The program ends only when a full re-audit scores every dimension at or above its ratified target (`docs/program/target-cards.md`) AND the owner's U3 hour of real use confirms it feels right.

State as of 2026-08-04: **Campaign C1 (Trust & state truth) closed 2026-07-30 at 10/10** with every criterion pinned in CI. **Campaign C2 (Structure) is in flight** (`docs/program/campaign-c2-structure.md`): the sign-in door landed (#803); the Plan-surface port merged (#804) but its truth spec then failed on main, so the main-red guard opened revert #806 (auto-merge armed) — S2 re-lands with the fix; the Review port (#809) waits behind it. The moments home is the single shell; all four legacy screens are being ported into it (owner-ratified).

The shipped product baseline: areas, capture, optional AI/mock parse, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, deterministic health checks, audit-oriented persistence, and a versioned headless client surface (`/api/v1` + `@lifeos/cli`) alongside the web app.

## Decisions in effect

- **Program governance (owner 2026-07-26):** the Final UX Loop owns priority; campaigns close only by fresh-eyes re-score against ratified Target Cards; every passed criterion ships a CI pin in the same PR.
- **Plain language for humans (owner 2026-08-04):** anything shown to a human — UI copy, reports, owner options — uses simple, easy-to-understand language. Technical density belongs in agent-to-agent docs only.
- Safety boundaries are unchanged: no silent external writes, no autonomous rescheduling, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- Branch protection on `main` requires `Monorepo Validation`, `Playwright E2E`, and `Migrations + RLS Verification`; GitHub auto-merge gates on these. The Main Red Guard auto-opens a revert PR when main goes red twice.
- Per ADR 0006 (multi-client doctrine): one deployable Next.js app is the single authoritative domain/security layer for multiple clients; web UI and headless `@lifeos/cli` consume shared, versioned `/api/v1` contracts with user-scoped bearer auth. No client reimplements business rules or writes to the database directly. Supabase Edge Functions are default-no unless a specific scheduled or integration constraint justifies them.
- Per ADR 0005 (staged evolution): stage labels order dependencies and risk; data-independent foundations may proceed when owner-ratified; evidence-dependent behavior stays gated on usage evidence. The FR-032/034/037 policy kernels are merged and mutation-tested but remain 1/4 overall — "kernel merged" and "feature shipped" are distinct claims.
- The stage-epic slice relay (`scripts/agent/pipeline-manifest.json` + `pipeline-advance.yml`) is **retired**: the Final UX Loop superseded it as the active program, and the workflow's automatic triggers were removed (owner-merged, 2026-08-05). `workflow_dispatch` remains for manual archaeology; the manifest is historical state.
- Persistence is intentionally mixed: authenticated Supabase paths where implemented; local/session fallback remains the recovery path when sync or env is unavailable.
- `design_handoff_lifeos/README.md` is a historical design reference; current UI authority lives in requirements, UX flows, ADRs, and shipped behavior.
- Governance docs are budgeted: `AGENTS.md` and `CLAUDE.md` stay small; detailed rulebooks live in `.agents/skills`; `docs/agent/` keeps `CODEX_PROMPT_TEMPLATE.md` and `LANES.md` (the Claude/Codex cross-lane protocol).
- Production Supabase migrations are applied via the gated `migration-apply.yml` workflow or manually — never by deploys; the `Migration Drift` workflow red-flags unapplied migrations, and the response procedure is `.agents/skills/lifeos-migration-drift-response/SKILL.md`.

## Constraints

- Before any work, check `docs/program/final-ux-loop.md` §6 for the live campaign and slice; one implementation lane at a time (program R7).
- Before feature work, map the task to `docs/REQUIREMENTS.md`, define acceptance criteria, identify tests, and flag risky surfaces.
- New user-owned tables require RLS policies, export coverage, and multi-user tests in the same change.
- Calendar/OAuth/RLS/schema/security/privacy/data-deletion changes require human review (the full ten-surface list lives in AGENTS.md "Human review required" — that list governs).
- Docs may not grow by creating session-note files; durable decisions go to ADRs, status goes here, program state goes to `docs/program/`.

## Open questions

- Onboarding ritual content (three steps, what they create) — OWNER-GATE; gates campaign C3's close only.
- Historical fake-"partial" session rows: backfill or leave as-is — OWNER-GATE from merged #764; left as-is until the owner decides.
- Consumer wiring for the FR-032/034/037 policy kernels is unscoped — each needs its own owner-ratified issue before becoming user-visible.
- CI `e2e` job still lacks a Supabase-env leg (C1 residual) — infrastructure lane, queued.

## Next action

Follow `docs/program/final-ux-loop.md` §6: re-land the C2-S2 Plan-surface port with its truth-spec fix, then S3 Review port (#809), then S4/S5/S6 and the fresh-eyes C2 re-score. Cross-lane work follows `docs/agent/LANES.md`; check for pending CLAIM/BLOCKER/HANDOFF comments on open issues first.

## Do-not-repeat

- Do not reintroduce broad autonomous behavior, vector search, realtime voice, team/SaaS features, or new ingestion channels without requirements review.
- Do not re-add archived design-handoff guidance as active UI authority.
- Do not hide integration failures behind optimistic copy; degrade honestly to local/demo-safe behavior.
- Do not bypass guard tests by weakening schemas, validators, RLS, server-only boundaries, or plain-language UX checks.
- Do not close a campaign by checklist — only a fresh-eyes re-score at/above target closes it (that failure mode is why the program exists).
- Do not append long running histories to this file; replace stale facts with current concise truth.
