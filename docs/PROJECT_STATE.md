# PROJECT_STATE.md

<!--
Template: replace sections in place; do not append a phase diary. Keep this file <=120 lines.
Sections: Current objective / Decisions in effect / Constraints / Open questions / Next action / Do-not-repeat.
-->

## Current objective

Evolve LifeOS from the shipped V1 personal workflow cockpit through narrow, owner-ratified, issue-driven work. V1 is the baseline, not the ceiling. Current shipped surface includes areas, capture, optional AI/mock parse capture, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, deterministic health checks, audit-oriented persistence, and (as of 2026-07-16/17) a versioned headless client surface alongside the web app. The moments-home visual pass (#483: substantial start hero, hoisted pipeline overview, eyebrow/type-scale cleanup) is owner-ratified and merged; #483 itself stays open pending final-look sign-off.

## Decisions in effect

- Safety boundaries are unchanged: no silent external writes, no autonomous rescheduling, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- Branch protection on `main` requires `Monorepo Validation`, `Playwright E2E`, and `Migrations + RLS Verification` (2026-07-03); GitHub auto-merge gates on these. The T0 safe auto-merge allowlist includes `.agents/skills/**` (owner-approved, 2026-07-03).
- Server logic remains one deployable Next.js app, and per ADR 0006 (multi-client doctrine, owner-ratified 2026-07-16) that app is the single authoritative domain/security layer for MULTIPLE clients: the web UI (primary) and the headless `@lifeos/cli` (`packages/cli`, agents/scripts/CI) consume shared, versioned `/api/v1` contracts (capabilities, tasks, areas, blocks/today, captures create + parse) with user-scoped bearer auth (`requireSupabaseServerUser`). No client reimplements business rules or writes to the database directly. Supabase Edge Functions are default-no unless a specific scheduled or integration constraint justifies them. A weekly CI leg (`weekly-prod-smoke.yml`) asserts the `/api/v1/capabilities` contract against production.
- Persistence is intentionally mixed: authenticated Supabase paths are used where implemented; local/session fallback remains the recovery path when sync or env is unavailable.
- `design_handoff_lifeos/README.md` is preserved as a historical design reference; current UI authority lives in requirements, UX flows, ADRs, and shipped behavior.
- ADR 0005 governs staged evolution: stage labels order dependencies and risk, data-independent foundations may proceed when owner-ratified, and evidence-dependent behavior remains gated by relevant usage evidence. Several FRs (FR-032 Initiative Ladder, FR-034 Sanctuary, FR-037 rupture/adaptive-surface) now have a merged pure-policy kernel each (`apps/web/src/lib/initiative`, `apps/web/src/lib/privacy`, `apps/web/src/lib/rupture`) independently verified and mutation-tested to 4/4 on their bounded contract — but every FR stays **1/4 overall**: no consumer wiring, persistence, UI, or user-visible behavior exists yet. Treat "kernel merged" and "feature shipped" as distinct claims.
- Google Calendar update/cancel, all-day conflict handling, and AI/env-dependent paths remain explicit follow-on scope, not implied fixes.
- Governance docs are budgeted: `AGENTS.md` and `CLAUDE.md` stay small; detailed rulebooks live in `.agents/skills`; `docs/agent/` keeps `CODEX_PROMPT_TEMPLATE.md` and `LANES.md` (the Claude/Codex cross-lane coordination protocol — pre-ACK on frozen manifests + a response-SLA to keep the blocked lane's wait near zero).
- Production Supabase migrations are applied manually (never by deploys); the `Migration Drift` workflow red-flags unapplied migrations on every `main` push, and the response procedure is `.agents/skills/lifeos-migration-drift-response/SKILL.md` (armed and proven 2026-07-04 after KNOWN_ISSUES row 11).

## Constraints

- Before feature work, map the task to `docs/REQUIREMENTS.md`, define acceptance criteria, identify tests, and flag risky surfaces.
- Use the smallest relevant context and skill set; search before broad reading.
- New user-owned tables require RLS policies, export coverage, and multi-user tests in the same change.
- Calendar/OAuth/RLS/schema/security/privacy/data-deletion changes require human review.
- UI changes must preserve the cockpit hierarchy: one obvious next action, visible area/time/uncertainty, non-shaming copy, and bounded browser proof when behavior changes.
- Docs may not grow by creating session-note files; durable decisions go to ADRs and current status goes here.

## Open questions

- Remaining cockpit Calendar/AI/env gaps from the 2026-06-30 flow audit need product decisions before implementation.
- The 2026-07-03 authenticated production smoke ran; its findings live in `docs/KNOWN_ISSUES.md` rows 11–14 — all four now resolved (hardening epic #325 and #338 both closed).
- Durable audit for draft rejection/edit/split/merge remains a product decision, not a persistence bug.
- Meta-learning logs exist but are not yet used for a closed learning loop.
- Consumer wiring for the FR-032/034/037 policy kernels (who calls them, persistence, UI) is unscoped — each needs its own owner-ratified issue before it becomes user-visible.

## Next action

Continue the smallest owner-ratified issue-scoped work that preserves permanent boundaries and applies ADR 0005. For cockpit flow work, consult `docs/implementation-planning/lifeos-flow-audit-findings-2026-06-30.md` and implement only the explicitly approved slice. For governance work, keep `AGENTS.md`/`CLAUDE.md` stable and move detailed procedures into skills. Cross-lane work (Claude + Codex) follows `docs/agent/LANES.md`'s claim/ACK/pre-ACK protocol; check for pending CLAIM/BLOCKER/HANDOFF comments on open issues first.

## Do-not-repeat

- Do not reintroduce broad autonomous behavior, vector search, realtime voice, team/SaaS features, or new ingestion channels without requirements review.
- Do not re-add archived Pass 7 guidance as active UI authority.
- Do not hide integration failures behind optimistic copy; degrade honestly to local/demo-safe behavior.
- Do not bypass guard tests by weakening schemas, validators, RLS, server-only boundaries, or plain-language UX checks.
- Do not append long running histories to this file; replace stale facts with current concise truth.
