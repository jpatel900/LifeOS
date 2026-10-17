# ENGINEERING_INVARIANTS.md

Status: Authority document — system-level engineering guarantees
Read when: Adding tables, multi-step writes, vendor calls, or sizable UI/logic code
Purpose: Positive guarantees the system must keep. Safety prohibitions live in `AGENTS.md` and `SECURITY_PRIVACY.md`; this file covers the engineering properties that decay silently when unwritten.

Each invariant names its enforcement. If you weaken an enforcement mechanism to pass a check, you have violated the invariant.

A new invariant ships its guard in the same PR, and the guard is proven able to fail: plant a violation, watch it go red, remove it.

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

## INV-6 — Degradation visibility

Repeated external-provider failures (AI parse, calendar) must surface as Health incidents, not only observability logs.

Enforcement: provider-incident derivation from `ai_call_traces` in `apps/web/src/lib/data/health.ts`, covered by `apps/web/src/lib/data/health.test.ts`.

## INV-7 — CI tells the truth

Every check the docs claim ("main must stay passing", RLS verified, migrations apply) runs in CI, not only on contributor machines. If you add a doc-claimed validation, wire it into `.github/workflows/` in the same change.

Enforcement: `.github/workflows/ci.yml` (lint, type-check, unit, build), e2e job, and migration+RLS job.

## INV-8 — Capture content is data, never instructions (containment + role separation guarded)

User- or externally-sourced capture text is untrusted input. No AI surface may execute, obey, or change its behaviour because of instructions embedded in captured content. Parse/extraction prompts must structurally separate the captured content from the system's own instructions (delimited or role-separated), and must treat any imperative inside the content ("ignore previous instructions", "mark everything done", "call the calendar tool") as literal task text to be parsed — never as a command to follow. Binding on every capture/parse surface, present and future (installable share-target, Stage 3 channels, any later external-agent petition).

Enforcement: `apps/web/src/lib/ai/injectionContainment.test.ts`: hostile captures come back only as review-required task/project draft text (the parse schema admits no tool-call, external-write, or time-block shape; always `triage_required`); directives stay in the system role; trusted personalization context travels in its own earlier message, and the raw capture is the final message, byte-exact, so it cannot forge trusted-context labels. `apps/web/src/lib/ai/triageSortContainment.test.tsx`: the Sort call site sends the capture as an isolated data field and builds no prompt client-side; a parse that bypasses `parseCaptureIntoDrafts` fails it. These prove pipeline structure, not a real model's behavior. They are a hard prerequisite before any Stage 3 external channel opens.

## INV-9 — Per-surface AI context budgets (representative-fixture guard wired; absolute runtime ceiling open)

Every AI surface receives the least context that answers its question, not the most that is available. The single context-assembly choke point (NS-INV-1) declares one representative-fixture budget for every exported message builder. Raising a fixture budget requires editing the declared maximum and its machine-checked justification together; the declaration map is the audit trail. Rationale: privacy (least life-data transits to any model), cost, and answer quality all point the same way; unbudgeted context creep is scope creep in its most invisible form.

Enforcement: `apps/web/src/lib/ai/contextAssembly.budget.test.ts` independently discovers exported `build*Messages` builders, renders each real builder with its named full-context fixture, freezes the assembled output and measured estimate, and asserts the estimate stays at or under the declaration in `contextAssembly.ts`. The deterministic estimate is Unicode code points in message content divided by four and rounded up; it deliberately excludes roles, transport framing, provider tokenizer behavior, and token overhead.

Scope limit: this is a truthful representative-fixture regression guard, not an absolute per-request token ceiling. Current builder inputs remain unbounded at runtime, so unusually large captures, rollups, task fields, or context arrays can exceed the declared fixture maximum. Runtime caps/truncation and their product semantics remain open work; do not claim INV-9 enforces an absolute runtime ceiling until that separate contract ships.

## INV-10 — Autonomy graduation gate (issue #268)

No action class may move up the trust ladder (ADR 0002 D1: L0 silent → L1 propose-per-instance → L2 propose-with-default → L3 auto-execute-reversible; irreversible/external classes never pass L2) without first clearing every item below. This is the dark-factory precondition checklist: the industry lesson that a Level 4/5 factory inherits the quality of its test oracle, so no class graduates faster than its oracle can prove it safe.

**Preconditions (all required before graduation):**

1. **Oracle exists and is strong** — a never-regress suite covers the class's behavior; changes to that suite are themselves one-way-door gated.
2. **Acceptance scenarios codified** — the class's contract is written in the issue/spec verbatim, not implied.
3. **Fitness functions guard the invariants** — guard tests in the style of `docRegistry.test.ts` (allowlist + shrink-only + budget) exist for every invariant the class could violate.
4. **Decision data collected** — approve/override/edit outcomes logged per instance, with graduation criteria pre-registered (default candidate: 20 consecutive non-overridden instances or 4 weeks, whichever is longer).
5. **De-graduation rule encoded** — one defect or near-miss moves the class back a rung automatically; re-graduation needs a fresh evidence run.
6. **Rollback trigger written before graduation** — "if `<metric/error>` exceeds `<threshold>` within `<window>`, revert via `<procedure>`"; for deploy-shaped classes, canary/staged rollout preferred.
7. **Fallback capability retained** — a human (or the class's Level-3-or-lower flow) can still operate the class if the automation is paused. Hands-off must never become hands-tied.
8. **Prompt-injection surface reviewed** — any class consuming external text (issues, emails, calendar payloads) gets an injection review before losing its human gate.

**Non-goals:**

- No class graduates by convenience, deadline, or "it always gets approved anyway."
- Irreversible/external classes (real calendar writes, outbound messages) stay human-gated regardless of ladder level until explicitly and individually delegated in writing.

**Applicability:** any future issue or PR proposing an automerge or auto-execute expansion MUST cite this section (INV-10) and show the checklist filled in, item by item, before the expansion may be considered.

**Currently graduated class:** the docs-only automerge lane (`scripts/agent/check-safe-automerge.mjs`, `scripts/agent/automation-policy.mjs`, `.github/workflows/safe-automerge.yml`; contract in `.github/AGENT_AUTOMATION_POLICY.md` T0, ADR 0008). It meets items 1, 2, 5, 6, 7; meets 8 only by scope (path/label checks never read diff content); partly meets 3 (the path allowlist has no shrink-only/budget guard); and fails 4 (no pre-registered decision data). It is not a template: any new expansion must clear all eight items itself.

## Stage epic invariants (NS-INV, ADR 0002)

The invariants below are defined in `docs/adr/0002-north-star-stages-and-trust-ladder.md` D4 and are binding on every Stage 1+ slice. They are recorded here with their concrete enforcement points as those slices land.

### NS-INV-1 — One context-assembly choke point

All personalization context injected into AI prompts (area charter, operator profile, rollups, people context) flows through a single assembly module: `apps/web/src/lib/ai/contextAssembly.ts` (alongside the existing `parseCapture` modules). No slice wires its own prompt-context plumbing.

Enforcement: WIRED — the module exists (`apps/web/src/lib/ai/contextAssembly.ts`, with `contextAssembly.test.ts`, `contextAssembly.budget.test.ts`, `contextAssembly.rollupProse.test.ts`) and `apps/web/src/__tests__/contextAssemblyChokePoint.test.ts` guards the choke point. INV-9's fixture-budget guard builds on this module.

### NS-INV-2 — Additive-only schema within an epic

No slice alters, renames, or repurposes a column/table introduced by an earlier slice of the same epic. The Stage 1 target schema shapes recorded in `docs/DATA_MODEL.md` sections 4.10-4.13 and 5.7-5.8 (`people`, `tasks` additive columns, `areas` additive columns, `operator_profiles`, `win_records`, `rollup_summaries`, parse-result schema extension) are the frozen Stage 1 contract; later slices may only add to them.

Enforcement: code review trigger against the frozen shapes in DATA_MODEL.md; any deviation requires a dated decision-log entry in the governing epic before proceeding (ADR 0002 D4).

### NS-INV-3 — Born instrumented

Every new AI judgment surface introduced by a Stage 1+ slice writes `suggestion_records` / `override_records` from its first merge, using the issue #235 vocabulary (stable policy identifiers, versioned zod schemas in `packages/schemas`). Trust-ladder graduation (ADR 0002 D1) is impossible for surfaces that skipped this.

Enforcement: (target) same pattern as issue #235's acceptance criteria — a golden-journey test proving suggestion/override rows are written with policy IDs, plus export coverage (INV-2 above) for both tables. Status: enforcement mechanism is per-slice; each Stage 1 slice that adds an AI judgment surface must include this test in its own PR, not defer it.
