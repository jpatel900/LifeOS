# PROJECT_STATE.md

<!--
Template: replace sections in place; do not append a phase diary. Keep this file <=120 lines.
Sections: Current objective / Decisions in effect / Constraints / Open questions / Next action / Do-not-repeat.
-->

## Current objective

Keep LifeOS focused on the shipped V1 personal workflow cockpit while completing narrow, issue-driven follow-up work. Current shipped surface includes areas, capture, optional AI/mock parse capture, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, deterministic health checks, audit-oriented persistence, and the handoff cockpit UI model.

## Decisions in effect

- Safety boundaries are unchanged: no silent external writes, no autonomous rescheduling, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- The app remains one deployable Next.js app for V1 server logic; Supabase Edge Functions are later/default-no unless a specific scheduled or integration constraint justifies them.
- Persistence is intentionally mixed: authenticated Supabase paths are used where implemented; local/session fallback remains the recovery path when sync or env is unavailable.
- The handoff cockpit is the active UI model. `design_handoff_lifeos/README.md` remains the active design reference; old Pass 7 visual-contract docs are history only.
- Google Calendar update/cancel, all-day conflict handling, and AI/env-dependent paths remain explicit follow-on scope, not implied fixes.
- Governance docs are budgeted: `AGENTS.md` and `CLAUDE.md` stay small; detailed rulebooks live in `.agents/skills`; `docs/agent/` keeps only `CODEX_PROMPT_TEMPLATE.md`.

## Constraints

- Before feature work, map the task to `docs/REQUIREMENTS.md`, define acceptance criteria, identify tests, and flag risky surfaces.
- Use the smallest relevant context and skill set; search before broad reading.
- New user-owned tables require RLS policies, export coverage, and multi-user tests in the same change.
- Calendar/OAuth/RLS/schema/security/privacy/data-deletion changes require human review.
- UI changes must preserve the cockpit hierarchy: one obvious next action, visible area/time/uncertainty, non-shaming copy, and bounded browser proof when behavior changes.
- Docs may not grow by creating session-note files; durable decisions go to ADRs and current status goes here.

## Open questions

- Remaining cockpit Calendar/AI/env gaps from the 2026-06-30 flow audit need product decisions before implementation.
- Production smoke for issue #93 still needs authenticated verification without weakening deployment protection.
- Durable audit for draft rejection/edit/split/merge remains a product decision, not a persistence bug.
- Meta-learning logs exist but are not yet used for a closed learning loop.

## Next action

Continue the smallest issue-scoped work that preserves V1 boundaries. For cockpit flow work, consult `docs/implementation-planning/lifeos-flow-audit-findings-2026-06-30.md` and implement only the explicitly approved slice. For governance work, keep `AGENTS.md`/`CLAUDE.md` stable and move detailed procedures into skills.

## Do-not-repeat

- Do not reintroduce broad autonomous behavior, vector search, realtime voice, team/SaaS features, or new ingestion channels without requirements review.
- Do not re-add archived Pass 7 guidance as active UI authority.
- Do not hide integration failures behind optimistic copy; degrade honestly to local/demo-safe behavior.
- Do not bypass guard tests by weakening schemas, validators, RLS, server-only boundaries, or plain-language UX checks.
- Do not append long running histories to this file; replace stale facts with current concise truth.
