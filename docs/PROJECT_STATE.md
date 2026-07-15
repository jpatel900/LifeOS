# PROJECT_STATE.md

<!--
Template: replace sections in place; do not append a phase diary. Keep this file <=120 lines.
Sections: Current objective / Decisions in effect / Constraints / Open questions / Next action / Do-not-repeat.
-->

## Current objective

Evolve LifeOS from the shipped V1 personal workflow cockpit through narrow, owner-ratified, issue-driven work. V1 is the baseline, not the ceiling. Current shipped surface includes areas, capture, optional AI/mock parse capture, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, deterministic health checks, and audit-oriented persistence.

## Decisions in effect

- Safety boundaries are unchanged: no silent external writes, no autonomous rescheduling, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- Branch protection on `main` requires `Monorepo Validation`, `Playwright E2E`, and `Migrations + RLS Verification` (2026-07-03); GitHub auto-merge gates on these. The T0 safe auto-merge allowlist includes `.agents/skills/**` (owner-approved, 2026-07-03).
- The app remains one deployable Next.js app for current server logic; Supabase Edge Functions are default-no unless a specific scheduled or integration constraint justifies them.
- Persistence is intentionally mixed: authenticated Supabase paths are used where implemented; local/session fallback remains the recovery path when sync or env is unavailable.
- `design_handoff_lifeos/README.md` is preserved as a historical design reference; current UI authority lives in requirements, UX flows, ADRs, and shipped behavior.
- ADR 0005 governs staged evolution: stage labels order dependencies and risk, data-independent foundations may proceed when owner-ratified, and evidence-dependent behavior remains gated by relevant usage evidence.
- Google Calendar update/cancel, all-day conflict handling, and AI/env-dependent paths remain explicit follow-on scope, not implied fixes.
- Governance docs are budgeted: `AGENTS.md` and `CLAUDE.md` stay small; detailed rulebooks live in `.agents/skills`; `docs/agent/` keeps only `CODEX_PROMPT_TEMPLATE.md`.
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
- The 2026-07-03 authenticated production smoke ran; its findings live in `docs/KNOWN_ISSUES.md` rows 11–14 (11 resolved; 12–13 scheduled in hardening epic #325, in flight; 14 scheduled as #338).
- Durable audit for draft rejection/edit/split/merge remains a product decision, not a persistence bug.
- Meta-learning logs exist but are not yet used for a closed learning loop.

## Next action

Continue the smallest owner-ratified issue-scoped work that preserves permanent boundaries and applies ADR 0005. For cockpit flow work, consult `docs/implementation-planning/lifeos-flow-audit-findings-2026-06-30.md` and implement only the explicitly approved slice. For governance work, keep `AGENTS.md`/`CLAUDE.md` stable and move detailed procedures into skills.

## Do-not-repeat

- Do not reintroduce broad autonomous behavior, vector search, realtime voice, team/SaaS features, or new ingestion channels without requirements review.
- Do not re-add archived Pass 7 guidance as active UI authority.
- Do not hide integration failures behind optimistic copy; degrade honestly to local/demo-safe behavior.
- Do not bypass guard tests by weakening schemas, validators, RLS, server-only boundaries, or plain-language UX checks.
- Do not append long running histories to this file; replace stale facts with current concise truth.
