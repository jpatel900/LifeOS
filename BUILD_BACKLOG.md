# BUILD_BACKLOG.md

# Build Backlog — Area-Scoped Personal Workflow Cockpit

This backlog is derived from:

- `PROJECT_BRIEF.md`
- `REQUIREMENTS.md`
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `UX_FLOWS.md`
- `TEST_PLAN.md`
- `SECURITY_PRIVACY.md`

It is organized into small implementation tickets in dependency order.  
Each ticket includes goal, likely files, dependencies, acceptance criteria, required checks, and execution safety.

---

## 1) Foundation

### FND-001 — Monorepo/app skeleton and shared package layout

- **Goal:** Establish the expected repo structure (`apps/web`, `packages/*`, `supabase/*`, `docs`) and baseline toolchain.
- **Files likely touched:** `apps/web/*`, `packages/schemas/*`, `packages/types/*`, `packages/ui/*`, `packages/utils/*`, `supabase/*`, root config files.
- **Dependencies:** None.
- **Acceptance criteria:**
  - Folder structure matches architecture expectations.
  - Web app boots locally.
  - Shared package imports resolve from web app.
  - No business logic implemented yet.
- **Tests/checks required:**
  - Install/build succeeds.
  - Basic typecheck succeeds.
  - Basic lint succeeds.
- **Execution safety:** **Safe for Codex**.

### FND-002 — Environment variable contract and config guardrails

- **Goal:** Define and document required env vars (AI model tiers, Supabase, calendar integration) with safe defaults and startup validation.
- **Files likely touched:** `.env.example`, `apps/web/*config*`, `apps/web/*env*`, `docs/*`.
- **Dependencies:** FND-001.
- **Acceptance criteria:**
  - Required env vars documented.
  - App fails fast with clear message when required server vars are missing.
  - No secrets committed.
- **Tests/checks required:**
  - Config unit tests for missing/invalid env handling.
  - Manual startup check with/without env vars.
- **Execution safety:** **Safe for Codex**.

### FND-003 — Shared schema/versioning conventions and doc baseline

- **Goal:** Add schema-first conventions (schema version, prompt version, validation pattern) before feature implementation.
- **Files likely touched:** `packages/schemas/*`, `packages/types/*`, `docs/*`, `AGENTS.md` references if needed.
- **Dependencies:** FND-001.
- **Acceptance criteria:**
  - Shared schema package has clear conventions and versioning pattern.
  - Feature teams can add schemas consistently.
- **Tests/checks required:**
  - Unit test proving schema package compiles/exports.
- **Execution safety:** **Safe for Codex**.

---

## 2) Data Model

### DM-001 — Initial migration set for core scope/workflow tables

- **Goal:** Create initial Postgres migrations for `areas`, `global_defaults`, `capture_items`, `projects`, `tasks`, `time_block_proposals`, `calendar_blocks`, `execution_sessions`, `review_entries`.
- **Files likely touched:** `supabase/migrations/*`, `DATA_MODEL.md` (if adjustments required).
- **Dependencies:** FND-001.
- **Acceptance criteria:**
  - Tables and key columns match `DATA_MODEL.md`.
  - Required indexes added for user/area/status/time lookups.
  - No destructive behavior by default (archive-friendly states).
- **Tests/checks required:**
  - Migration apply/rollback in local Supabase.
  - Schema diff review against data model doc.
- **Execution safety:** **Cursor/local review preferred** (DB structure risk).

### DM-002 — Meta-learning, audit, and health tables

- **Goal:** Add remaining tables: `ambiguity_assessments`, `discovery_questions`, profiles, suggestions/overrides, `health_checks`, `health_incidents`, `repair_guides`, `external_write_events`, `ai_recommendations`, `user_decisions`.
- **Files likely touched:** `supabase/migrations/*`, `DATA_MODEL.md`.
- **Dependencies:** DM-001.
- **Acceptance criteria:**
  - Table set covers AI, learning, health, and audit flows from docs.
  - Foreign keys and nullable rules align with flow requirements.
- **Tests/checks required:**
  - Migration apply test.
  - Referential integrity spot checks.
- **Execution safety:** **Cursor/local review preferred**.

### DM-003 — Shared TypeScript types generated/aligned with schema

- **Goal:** Ensure app/runtime types are consistent with DB and shared schema objects.
- **Files likely touched:** `packages/types/*`, `packages/schemas/*`, optional generated type outputs.
- **Dependencies:** DM-001, DM-002.
- **Acceptance criteria:**
  - Types are available for all key entities used by V1.
  - No duplicated conflicting type definitions.
- **Tests/checks required:**
  - Typecheck passes across workspace.
- **Execution safety:** **Safe for Codex**.

---

## 3) Auth/Security

### SEC-001 — RLS enablement and policies for all user-owned tables

- **Goal:** Enforce deny-by-default data isolation using `auth.uid() = user_id` policy pattern.
- **Files likely touched:** `supabase/migrations/*` (RLS + policies), `SECURITY_PRIVACY.md` notes if needed.
- **Dependencies:** DM-001, DM-002.
- **Acceptance criteria:**
  - RLS enabled on all user-owned tables.
  - Select/insert/update/delete policies exist per table (or explicit no-delete decision).
  - No broad allow-all policies.
- **Tests/checks required:**
  - Two-user RLS tests proving isolation.
  - Negative tests for cross-user access and insert spoofing.
- **Execution safety:** **Must stay in Cursor/local review** (forbidden-change zone).

### SEC-002 — Auth-guarded route shell and session gating

- **Goal:** Protect app routes except login and enforce authenticated session behavior.
- **Files likely touched:** `apps/web/app/*`, auth middleware/guards, auth client setup.
- **Dependencies:** FND-001, SEC-001.
- **Acceptance criteria:**
  - Unauthenticated users are redirected to login.
  - Authenticated users can access core routes.
  - No service-role key exposure in frontend.
- **Tests/checks required:**
  - Auth flow integration test.
  - Manual route access smoke test.
- **Execution safety:** **Safe for Codex** (with local verification).

### SEC-003 — External write safety contract (approval gate + audit hook)

- **Goal:** Define backend write contract requiring explicit approval flag and audit event creation for external actions.
- **Files likely touched:** `packages/types/*`, `packages/schemas/*`, server function stubs, `docs/*`.
- **Dependencies:** SEC-001.
- **Acceptance criteria:**
  - Contract requires explicit approval for calendar writes.
  - Contract enforces write-result logging fields.
  - No direct AI-to-external-write path exists.
- **Tests/checks required:**
  - Unit tests for contract validation.
  - Integration test stub proving approval required.
- **Execution safety:** **Cursor/local review preferred** (calendar safety critical).

---

## 4) Mock UI Flows

### UI-001 — Navigation scaffold for V1 routes

- **Goal:** Create basic routes/screens: capture, triage, calendar/planning, execute, daily review, weekly review, health, settings.
- **Files likely touched:** `apps/web/app/*`, `apps/web/components/*`.
- **Dependencies:** FND-001, SEC-002.
- **Acceptance criteria:**
  - Route map from `UX_FLOWS.md` exists.
  - Navigation works end-to-end without backend features completed.
  - Clear placeholder states for incomplete features.
- **Tests/checks required:**
  - E2E smoke route navigation test.
- **Execution safety:** **Safe for Codex**.

### UI-002 — First-time setup flow (areas + optional calendar connect placeholder)

- **Goal:** Implement lightweight onboarding with default areas and optional integration step.
- **Files likely touched:** `apps/web/app/*`, `apps/web/components/*`, seed/init logic.
- **Dependencies:** UI-001, DM-001.
- **Acceptance criteria:**
  - Setup can be completed quickly.
  - User can skip calendar connect.
  - Default areas are created and editable later.
- **Tests/checks required:**
  - Integration test for initial user + area seed.
  - UI flow test for skip path.
- **Execution safety:** **Safe for Codex**.

### UI-003 — Mocked Capture → Triage → Accept flow (no real AI yet)

- **Goal:** Deliver UX skeleton using deterministic mock data for parsed drafts and triage actions.
- **Files likely touched:** `apps/web/app/capture/*`, `apps/web/app/triage/*`, mock adapters.
- **Dependencies:** UI-001, DM-001.
- **Acceptance criteria:**
  - User can submit capture text and see draft objects.
  - User can accept/edit/reject in triage UI.
  - Accepted mock items can persist as tasks/projects.
- **Tests/checks required:**
  - Component/integration tests for state transitions.
  - E2E quick-capture flow smoke test.
- **Execution safety:** **Safe for Codex**.

---

## 5) AI Parsing

### AI-001 — Implement V1 structured schemas in `packages/schemas`

- **Goal:** Create required AI output schemas (`ParseCaptureResponse`, `AmbiguityAssessmentResponse`, etc.) with strict validation.
- **Files likely touched:** `packages/schemas/*`, `packages/types/*`.
- **Dependencies:** FND-003.
- **Acceptance criteria:**
  - All required schema contracts exist and are versioned.
  - Strict validation rejects malformed output.
- **Tests/checks required:**
  - Schema unit tests with valid and invalid fixtures.
  - Contract tests for required fields (confidence, unknowns, etc.).
- **Execution safety:** **Safe for Codex**.

### AI-002 — `parse_capture` function with mock AI adapter

- **Goal:** Implement parse flow with deterministic mock adapter first, including raw-capture-first persistence and recoverable errors.
- **Files likely touched:** `supabase/functions/parse_capture/*`, `apps/web` integration points, `packages/schemas/*`.
- **Dependencies:** DM-001, AI-001.
- **Acceptance criteria:**
  - Raw capture persists before parse attempt.
  - Valid parse creates draft objects.
  - Invalid output does not commit and yields recoverable error state.
- **Tests/checks required:**
  - Integration tests for success/failure paths.
  - Invariant test: raw capture not lost.
- **Execution safety:** **Safe for Codex**.

### AI-003 — Real AI adapter wiring with privacy and validation controls

- **Goal:** Replace mock adapter with Responses API structured outputs, enforce `store: false` where supported, schema validation, and version logging.
- **Files likely touched:** AI adapter modules, `supabase/functions/parse_capture/*`, env/config files.
- **Dependencies:** AI-002, FND-002.
- **Acceptance criteria:**
  - AI calls are schema-constrained and validated before persistence.
  - Prompt/schema versions are logged.
  - Minimal necessary data sent to AI.
- **Tests/checks required:**
  - Adapter integration tests (mocked external API).
  - Privacy checks for payload minimization.
  - Contract tests ensuring invalid model output is rejected.
- **Execution safety:** **Cursor/local review preferred** (provider integration + privacy risk).

---

## 6) Calendar Proposal Flow

### CAL-001 — Local time-block proposal engine (no external writes)

- **Goal:** Implement proposal generation from task + area preferences + optional free/busy checks, with conflict flagging.
- **Files likely touched:** `supabase/functions/propose_blocks/*`, planning UI files, relevant schema/types.
- **Dependencies:** AI-002, DM-001, UI-003.
- **Acceptance criteria:**
  - Creates local proposals with rationale and conflict flags.
  - Works even when calendar integration is disconnected.
  - Does not perform external writes.
- **Tests/checks required:**
  - Integration tests for connected/disconnected calendar cases.
  - State transition tests for proposal statuses.
- **Execution safety:** **Safe for Codex**.

### CAL-002 — Approval-gated calendar write function + idempotency

- **Goal:** Implement `approve_calendar_write` with explicit approval check, duplicate prevention, and `external_write_events` logging.
- **Files likely touched:** `supabase/functions/approve_calendar_write/*`, calendar adapter wrapper, audit table usage.
- **Dependencies:** CAL-001, SEC-003, DM-002.
- **Acceptance criteria:**
  - No write occurs without explicit user approval.
  - Successful writes store provider event ID.
  - Every write attempt is audit-logged.
  - Failed write does not mark block scheduled.
- **Tests/checks required:**
  - Mock calendar integration tests for success/failure/duplicate attempts.
  - Invariant tests for approval gate and audit log creation.
- **Execution safety:** **Must stay in Cursor/local review** (critical external write logic).

### CAL-003 — Calendar UI confirm flow and error recovery

- **Goal:** Add final confirmation UX, visible write result, and retry-safe failure handling.
- **Files likely touched:** `apps/web/app/calendar/*`, `apps/web/components/*`.
- **Dependencies:** CAL-002.
- **Acceptance criteria:**
  - Final confirmation required before write call.
  - Clear success/failure feedback shown.
  - User can continue in local-only mode.
- **Tests/checks required:**
  - E2E approval/write UI test with mocked adapter.
  - Error-state UI tests.
- **Execution safety:** **Safe for Codex**.

---

## 7) Execution/Session Tracking

### EXE-001 — Execute screen and single-task session controls

- **Goal:** Build one-task execution UI (timer, pause, distracted, stuck, complete/stop, quick capture side panel).
- **Files likely touched:** `apps/web/app/execute/*`, shared UI components.
- **Dependencies:** UI-001, DM-001.
- **Acceptance criteria:**
  - One primary task is visible during execution.
  - Session controls work and do not break navigation.
  - End-of-session form captures required fields.
- **Tests/checks required:**
  - Component/integration tests for timer/session state.
  - E2E execute flow smoke test.
- **Execution safety:** **Safe for Codex**.

### EXE-002 — `mark_block_result` and session persistence

- **Goal:** Persist execution outcomes and update block status/logs for completed/missed/partial sessions.
- **Files likely touched:** `supabase/functions/mark_block_result/*`, data write adapters.
- **Dependencies:** EXE-001, DM-001.
- **Acceptance criteria:**
  - Execution session rows are created reliably.
  - Productivity/duration fields are bounded and validated.
  - Missed status updates support later recovery flow.
- **Tests/checks required:**
  - Integration tests for each outcome path.
  - Validation tests for field bounds (e.g., productivity 1-5).
- **Execution safety:** **Safe for Codex**.

### EXE-003 — Missed block recovery proposal loop

- **Goal:** Implement UX + backend path to mark missed and create replacement proposals without autonomous write.
- **Files likely touched:** `apps/web/app/calendar/*`, `supabase/functions/propose_blocks/*`, state transition code.
- **Dependencies:** EXE-002, CAL-001.
- **Acceptance criteria:**
  - Missed blocks can be marked and rescheduled.
  - Recovery produces proposals only; external updates remain approval-gated.
- **Tests/checks required:**
  - E2E missed-block recovery test.
  - Invariant test: no write before approval.
- **Execution safety:** **Safe for Codex**.

---

## 8) Review/Health

### RVH-001 — Daily/weekly review data and UI flows

- **Goal:** Implement review screens showing completed/missed/moved/blocked/open items and area-level weekly patterns.
- **Files likely touched:** `apps/web/app/review/*`, review query/services, `review_entries` usage.
- **Dependencies:** EXE-002, CAL-001.
- **Acceptance criteria:**
  - Daily review is fast and actionable.
  - Weekly review is area-scoped and supports suggestion approval flow.
  - No hidden policy mutation occurs.
- **Tests/checks required:**
  - Integration tests for review queries.
  - E2E daily + weekly review smoke tests.
- **Execution safety:** **Safe for Codex**.

### RVH-002 — Deterministic health engine + incidents

- **Goal:** Implement rule-based health scoring and incident tracking by subsystem and area.
- **Files likely touched:** `supabase/functions/health_check/*`, health scoring modules, health UI.
- **Dependencies:** DM-002, SEC-001.
- **Acceptance criteria:**
  - Health scores are deterministic (not AI-invented).
  - Incidents include severity, subsystem, details, repair steps.
  - Auth/DB/AI/calendar failures are distinguished.
- **Tests/checks required:**
  - Unit tests for health scoring rules.
  - Integration tests for incident creation/update lifecycle.
- **Execution safety:** **Safe for Codex**.

### RVH-003 — AI narrative layer for health/review explanations (non-authoritative)

- **Goal:** Add optional AI-generated explanation text that never controls scores or external actions.
- **Files likely touched:** review/health AI adapters, schema files, UI display components.
- **Dependencies:** RVH-001, RVH-002, AI-003.
- **Acceptance criteria:**
  - AI narrative is clearly secondary/explanatory.
  - Underlying deterministic health/review values remain source of truth.
- **Tests/checks required:**
  - Contract tests for narrative schema.
  - UI tests proving deterministic values remain unchanged when narrative fails.
- **Execution safety:** **Cursor/local review preferred** (AI boundary clarity).

---

## 9) Deployment

### DEP-001 — Preview environment wiring (web + Supabase project strategy)

- **Goal:** Define and implement preview deployment with separated environment configuration.
- **Files likely touched:** deployment configs, environment docs, CI config.
- **Dependencies:** FND-002, SEC-002.
- **Acceptance criteria:**
  - Preview deploy works with non-production secrets.
  - Production calendar writes are disabled by default in preview.
- **Tests/checks required:**
  - Preview deploy smoke test.
  - Manual verification of env separation.
- **Execution safety:** **Safe for Codex**.

### DEP-002 — CI checks as merge gate

- **Goal:** Add mandatory checks: lint, typecheck, unit, integration, schema tests, and RLS tests where applicable.
- **Files likely touched:** CI workflow config, test scripts, package scripts.
- **Dependencies:** Core test suites from prior phases.
- **Acceptance criteria:**
  - PRs fail when required checks fail.
  - Required checks map to AGENTS/test-plan done rules.
- **Tests/checks required:**
  - CI dry run on sample change.
  - Verify failed test blocks merge.
- **Execution safety:** **Safe for Codex**.

### DEP-003 — Production readiness checklist and runbook

- **Goal:** Create go-live checklist covering security/privacy, calendar safety, rollback, and operational checks.
- **Files likely touched:** `docs/*` runbook/checklist files, root README links.
- **Dependencies:** SEC-001, CAL-002, DEP-002.
- **Acceptance criteria:**
  - Checklist includes approval-gated write verification, RLS verification, secrets review, and rollback steps.
  - Team can execute release with a repeatable process.
- **Tests/checks required:**
  - Manual rehearsal of checklist in preview.
- **Execution safety:** **Safe for Codex**.

---

## Cross-Cutting Ticket Rules

Apply to every ticket:

- Must map to existing `REQUIREMENTS.md` scope (or requirements must be updated first).
- Must declare explicit acceptance criteria before implementation.
- Must include at least one negative/error-path test where applicable.
- Must not introduce autonomous external writes.
- Must keep architecture simple and low-cost by default.

## Suggested Execution Order (High-Level)

1. Foundation (`FND-*`)
2. Data model (`DM-*`)
3. Auth/security (`SEC-*`)
4. Mock UX vertical slice (`UI-*`)
5. AI parsing (`AI-*`)
6. Calendar proposal/write flow (`CAL-*`)
7. Execution/session tracking (`EXE-*`)
8. Review/health (`RVH-*`)
9. Deployment hardening (`DEP-*`)
