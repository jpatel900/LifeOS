# ENGINEERING_INVARIANTS.md

Status: Authority document — system-level engineering guarantees
Read when: Adding tables, multi-step writes, vendor calls, or sizable UI/logic code
Purpose: Positive guarantees the system must keep. Safety prohibitions live in `AGENTS.md` and `SECURITY_PRIVACY.md`; this file covers the engineering properties that decay silently when unwritten.

Each invariant names its enforcement. If you weaken an enforcement mechanism to pass a check, you have violated the invariant.

## INV-1 — Atomic multi-table transitions

Any persisted workflow transition that writes more than one table must execute inside one transactional server boundary — a `SECURITY INVOKER` Postgres function called via RPC (pattern: `supabase/migrations/20260612120000_add_workflow_transition_functions.sql`, callers in `apps/web/src/lib/data/workflow.ts`). Never sequence dependent writes from the client.

Enforcement: code review trigger + two-user RPC tests in `apps/web/src/__tests__/phase4aRls.local.test.ts`. New multi-write features ship a failure-in-the-middle or denial test.

## INV-2 — Export coverage

Every user-owned table is either exported by `USER_DATA_EXPORT_TABLES` in `apps/web/src/lib/data/export.ts` or on its documented exclusion list (secrets only — currently `google_calendar_connections`). New tables must be added in the same PR that creates them.

Enforcement: `apps/web/src/__tests__/engineeringInvariants.test.ts` parses migrations and fails on uncovered tables.

## INV-3 — Vendor seams

External service specifics (hostnames, request shapes, auth headers) live only in adapter modules: `apps/web/src/lib/ai/provider/` for AI, `apps/web/src/lib/googleCalendar/` for calendar. Product code depends on the adapter interface, never on a vendor URL. Adding a provider means adding an adapter, not editing call sites.

Enforcement: `apps/web/src/__tests__/engineeringInvariants.test.ts` fails on vendor hostnames outside adapter dirs.

## INV-4 — Module budgets

Route pages (`apps/web/src/app/**/page.tsx`) stay at or under 800 lines; pure logic and presentation derivations belong in `apps/web/src/lib/` with focused tests (pattern: `lib/planning/presentation.ts`). Extracting logic from an over-budget module you are already touching is in scope, not scope creep.

Enforcement: `apps/web/src/__tests__/engineeringInvariants.test.ts` — grandfathered files may shrink but never grow past their recorded ceiling; new files get the default budget.

## INV-5 — Degradation visibility (open)

Repeated external-provider failures (AI parse, calendar) must surface as Health incidents, not only observability logs. Status: NOT yet wired — tracked in `docs/KNOWN_ISSUES.md`. Do not claim it; do close it.

## INV-6 — CI tells the truth

Every check the docs claim ("main must stay passing", RLS verified, migrations apply) runs in CI, not only on contributor machines. If you add a doc-claimed validation, wire it into `.github/workflows/` in the same change.

Enforcement: `.github/workflows/ci.yml` (lint, type-check, unit, build), e2e job, and migration+RLS job.
