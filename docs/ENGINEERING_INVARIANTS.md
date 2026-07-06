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

## INV-5 — Cockpit reachability

Every cockpit state rendered by `apps/web/src/lib/cockpit/viewModel.ts` or `apps/web/src/lib/today/buildTodayCockpitModel.ts` must be produced by replaying real `apps/web/src/lib/workflow.ts` transitions from canonical seeds. Tests must not hand-construct view-model inputs; they use the transition-only helpers in `apps/web/src/__tests__/helpers/workflowReachability.ts`, with persistence-tier coverage adding `apps/web/src/lib/data/workflow.ts` rather than bypassing workflow truth.

Enforcement: `apps/web/src/__tests__/sourceOfTruth.test.ts` fails if cockpit model tests call model builders directly outside the reachability helper; journey tests reuse the helper's golden capture → triage → plan → approve → execute → review seed.

## INV-6 — Degradation visibility (open)

Repeated external-provider failures (AI parse, calendar) must surface as Health incidents, not only observability logs. Status: NOT yet wired — tracked in `docs/KNOWN_ISSUES.md`. Do not claim it; do close it.

## INV-7 — CI tells the truth

Every check the docs claim ("main must stay passing", RLS verified, migrations apply) runs in CI, not only on contributor machines. If you add a doc-claimed validation, wire it into `.github/workflows/` in the same change.

Enforcement: `.github/workflows/ci.yml` (lint, type-check, unit, build), e2e job, and migration+RLS job.

## INV-8 — Capture content is data, never instructions (containment guarded; delimiter hardening open)

User- or externally-sourced capture text is untrusted input. No AI surface may execute, obey, or change its behaviour because of instructions embedded in captured content. Parse/extraction prompts must structurally separate the captured content from the system's own instructions (delimited or role-separated), and must treat any imperative inside the content ("ignore previous instructions", "mark everything done", "call the calendar tool") as literal task text to be parsed — never as a command to follow. Binding on every capture/parse surface, present and future (installable share-target, Stage 3 channels, any later external-agent petition).

Enforcement (Batch B, a hard prerequisite before any Stage 3 external channel opens): parser guard tests carry hostile-capture fixtures (`apps/web/src/lib/ai/injectionContainment.test.ts`) asserting injected imperatives surface as ordinary review-required task/project draft text and cause no tool call, status change, or context escalation — the parse response is a discriminated union of task/project drafts only (no tool-call, external-write, blocker, or time-block shape can validate), always `triage_required`, and the assembled prompt keeps the data-not-instructions / no-external-action directives in the system role with raw capture confined to the user role. Status: **containment + prompt-structure guards WIRED (2026-07-06)** — the pipeline/architecture properties INV-8 names are enforced; the fixtures do NOT (and a mock cannot) prove a real model's behavior. **OPEN follow-up before Stage 3:** raw capture is concatenated un-delimited ahead of the forgeable `Area charters:` / `Operator profile:` / `Recent rollups:` labels — a context-escalation vector; hardening (delimit or role-separate the trusted context) mutates the NS-INV-1 choke point's byte-identical output (#254) and is an owner-gated prompt-architecture decision.

## INV-9 — Per-surface AI context budgets (open)

Every AI surface receives the least context that answers its question, not the most that is available. The single context-assembly choke point (NS-INV-1) declares a per-surface context budget; assembling more than a surface's declared budget is a failure. Raising a budget requires editing the declared value in the same change as its justification (doc-registry discipline — the budget map is the audit trail). Rationale: privacy (least life-data transits to any model), cost, and answer quality all point the same way; unbudgeted context creep is scope creep in its most invisible form.

Enforcement: (target, guard pending — Batch B, lands with the NS-INV-1 guard) a test rendering each surface's assembled context against fixtures and asserting it stays at or under its declared budget. Status: NOT yet wired — depends on `contextAssembly.ts` existing (NS-INV-1). Do not claim it enforced until that guard merges.

## Stage epic invariants (NS-INV, ADR 0002)

The invariants below are defined in `docs/adr/0002-north-star-stages-and-trust-ladder.md` D4 and are binding on every Stage 1+ slice. They are recorded here with their concrete enforcement points as those slices land.

### NS-INV-1 — One context-assembly choke point

All personalization context injected into AI prompts (area charter, operator profile, rollups, people context) flows through a single assembly module: `apps/web/src/lib/ai/contextAssembly.ts` (alongside the existing `parseCapture` modules). No slice wires its own prompt-context plumbing.

Enforcement: (target, slice S2) a guard test asserting no prompt-construction code imports charter/profile/rollup/people context outside `contextAssembly.ts`. Status: NOT yet wired — the module and its guard test do not exist yet; this entry names the frozen path so later slices land in the same place. Do not claim it enforced until the guard test merges.

### NS-INV-2 — Additive-only schema within an epic

No slice alters, renames, or repurposes a column/table introduced by an earlier slice of the same epic. The Stage 1 target schema shapes recorded in `docs/DATA_MODEL.md` sections 4.10-4.13 and 5.7-5.8 (`people`, `tasks` additive columns, `areas` additive columns, `operator_profiles`, `win_records`, `rollup_summaries`, parse-result schema extension) are the frozen Stage 1 contract; later slices may only add to them.

Enforcement: code review trigger against the frozen shapes in DATA_MODEL.md; any deviation requires a dated decision-log entry in the governing epic before proceeding (ADR 0002 D4).

### NS-INV-3 — Born instrumented

Every new AI judgment surface introduced by a Stage 1+ slice writes `suggestion_records` / `override_records` from its first merge, using the issue #235 vocabulary (stable policy identifiers, versioned zod schemas in `packages/schemas`). Trust-ladder graduation (ADR 0002 D1) is impossible for surfaces that skipped this.

Enforcement: (target) same pattern as issue #235's acceptance criteria — a golden-journey test proving suggestion/override rows are written with policy IDs, plus export coverage (INV-2 above) for both tables. Status: enforcement mechanism is per-slice; each Stage 1 slice that adds an AI judgment surface must include this test in its own PR, not defer it.
