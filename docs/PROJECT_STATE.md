# PROJECT_STATE.md

<!--
Template: replace sections in place; do not append a phase diary. Keep this file <=120 lines.
Sections: Current objective / Decisions in effect / Constraints / Open questions / Next action / Do-not-repeat.
Freshness rule: if the newest date in this file is more than two weeks old, treat the file as
stale — check docs/program/final-ux-loop.md §6 and recent merged PRs before trusting any claim here.
-->

## Current objective

**Real use first owns priority** (owner decision 2026-09-29, Option A). Prepare the 10-day trial, then use LifeOS before more campaign work. The [Final UX Loop](program/final-ux-loop.md) keeps its rules and history but gives up the serial queue. Campaign implementation C2–C6 is parked and resumes only from trial findings. New feature work stays frozen; FR-049 is the sole exception. Narrow repairs to trial blockers remain allowed.

State as of 2026-09-29: **The trial has not started.** FR-049 is merged and deployed; production capture/Sort truth remains unverified (Part of #1026, test correction PR #1036). Live readiness is recorded in the program's §6. **C1** remains closed at 10/10. **C2** has its implementation slices merged and awaits only the owner's five-minute glance (§5.2); no implementation or re-score is active, and C2 is not closed. **C3** has technical onboarding proof in PR #999; the owner's experience and adoption gate remains unverified.

The shipped product baseline: areas, capture, optional AI/mock parse, triage, local-first planning, explicit approval-gated Google Calendar event creation, execution tracking, review logging, deterministic health checks, audit-oriented persistence, and a versioned headless client surface (`/api/v1` + `@lifeos/cli`) alongside the web app.

## Decisions in effect

- **Program priority (owner 2026-09-29):** the 10-day real-use trial replaces the serial campaign queue. C2 awaits the owner's five-minute glance, with no further re-score rounds. Other campaigns resume only from trial findings; independent acceptance and existing guards still apply. See program §3 and §7.
- **Merge lanes live (ADR 0008, owner-ratified; amended 2026-08-05):** program-doc auto-merge, additive-tests auto-merge, and the instant Telegram-notified self-merge lane (`selfmerge:auto`) are all live and lane-tested; the veto window is the CI runtime. Demotion: one-line `SELFMERGE_WINDOW.enabled` flip.
- **Owner decisions 2026-08-05 (parked calls cleared):** onboarding ritual content = the existing plan (`docs/implementation-planning/plan-onboarding-ritual.md`) is ratified as-is; the owner judges the built result at C3's experience gate. The #764 fake-"partial" session-rows gate closed as a **no-op** — prod verified 2026-08-05: zero such rows exist (2 total sessions, none `partial`). `KNOWN_ISSUES` triage runs at campaign close or monthly review, as governed by AGENTS.md rule 6.
- **Plain language for humans (owner 2026-08-04):** anything shown to a human — UI copy, reports, owner options — uses simple, easy-to-understand language. Technical density belongs in agent-to-agent docs only.
- Safety boundaries are unchanged: no silent external writes, no autonomous rescheduling, no AI-triggered calendar writes, no parser contract weakening, and no raw-capture loss on parse failure.
- Branch protection on `main` requires `Monorepo Validation`, `Playwright E2E`, and `Migrations + RLS Verification`; GitHub auto-merge gates on these. The Main Red Guard opens a revert PR when main goes red twice, but never arms auto-merge on it — owner decision 2026-08-05: notify-and-hold + stand-down + diagnosis. The PR waits for a human `revert:confirm` label, carries a plain-language diagnosis of the failure, and self-labels `revert:wont-fix` when its own CI shows the same job still failing.
- Per ADR 0006 (multi-client doctrine): one deployable Next.js app is the single authoritative domain/security layer for multiple clients; web UI and headless `@lifeos/cli` consume shared, versioned `/api/v1` contracts with user-scoped bearer auth. No client reimplements business rules or writes to the database directly. Supabase Edge Functions are default-no unless a specific scheduled or integration constraint justifies them.
- Per ADR 0005 (staged evolution): stage labels order dependencies and risk; data-independent foundations may proceed when owner-ratified; evidence-dependent behavior stays gated on usage evidence. The FR-032/034/037 policy kernels are merged and mutation-tested but remain 1/4 overall — "kernel merged" and "feature shipped" are distinct claims.
- The stage-epic slice relay (`scripts/agent/pipeline-manifest.json` + `pipeline-advance.yml`) is **retired**: the Final UX Loop superseded it as the active program, and the workflow's automatic triggers were removed (owner-merged, 2026-08-05). `workflow_dispatch` remains for manual archaeology; the manifest is historical state.
- Persistence is intentionally mixed: authenticated Supabase paths where implemented; local/session fallback remains the recovery path when sync or env is unavailable.
- `design_handoff_lifeos/README.md` is a historical design reference; current UI authority lives in requirements, UX flows, ADRs, and shipped behavior.
- Governance docs are budgeted: `AGENTS.md` and `CLAUDE.md` stay small; detailed rulebooks live in `.agents/skills`; `docs/agent/` keeps `CODEX_PROMPT_TEMPLATE.md` and `LANES.md` (the Claude/Codex cross-lane protocol).
- Production Supabase migrations are applied via the gated `migration-apply.yml` workflow or manually — never by deploys; the `Migration Drift` workflow red-flags unapplied migrations, and the response procedure is `.agents/skills/lifeos-migration-drift-response/SKILL.md`.

## Constraints

- Before any work, check `docs/program/final-ux-loop.md` §6 for the live campaign and slice; concurrent lanes allowed with disjoint declared manifests (program R7 as amended 2026-08-05; rules in `docs/agent/LANES.md`).
- Before feature work, map the task to `docs/REQUIREMENTS.md`, define acceptance criteria, identify tests, and flag risky surfaces.
- New user-owned tables require RLS policies, export coverage, and multi-user tests in the same change.
- Calendar/OAuth/RLS/schema/security/privacy/data-deletion changes require human review (the full ten-surface list lives in AGENTS.md "Human review required" — that list governs).
- Docs may not grow by creating session-note files; durable decisions go to ADRs, status goes here, program state goes to `docs/program/`.

## Open questions

- Consumer wiring for the FR-032/034/037 policy kernels is unscoped — each needs its own owner-ratified issue before becoming user-visible.

## Next action

Prove that a real production capture appears on Start and Sort makes a next step; the production rerun and account-save warning are still unverified. Then begin the trial in program §7. C2's five-minute owner glance remains pending alongside preparation; do not start another re-score round. Cross-lane work follows `docs/agent/LANES.md`.

## Do-not-repeat

- Do not reintroduce broad autonomous behavior, vector search, realtime voice, team/SaaS features, or new ingestion channels without requirements review.
- Do not re-add archived design-handoff guidance as active UI authority.
- Do not hide integration failures behind optimistic copy; degrade honestly to local/demo-safe behavior.
- Do not bypass guard tests by weakening schemas, validators, RLS, server-only boundaries, or plain-language UX checks.
- Do not restart the campaign queue from scores alone. Use trial findings; C2's pending owner glance follows program §5.2.
- Do not append long running histories to this file; replace stale facts with current concise truth.
