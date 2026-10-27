# Architecture — Area-Scoped Personal Workflow Cockpit

This document maps the runtime, the module that owns each business rule, and the behaviors that must survive changes. [ENGINEERING_INVARIANTS.md](ENGINEERING_INVARIANTS.md) owns the guarantees and their enforcement. [ADRs](adr/README.md) own decisions, [DATA_MODEL.md](DATA_MODEL.md) owns data contracts, and [PROJECT_STATE.md](PROJECT_STATE.md) owns delivery status.

**Source check: 2026-10-27, main at `133324eb1736fbead13c36cecad7862bd3183099`.** The owner map and weak points below describe that source revision. Open repair PRs are not main behavior. Source inspection establishes implementation structure, not runtime success, production parity, or user acceptance. Architectural requirements below remain requirements where enforcement is incomplete.

## 1. Architecture Goals

Optimize for:

1. one-person use
2. low cost
3. fast build
4. maintainability
5. minimal moving parts
6. future AI-agent maintainability
7. easy debugging
8. safe external writes

The architecture should be boring on purpose.

V1 describes the shipped architecture baseline, not a freeze on data-independent foundations. Reviewed evolution follows ADR 0005; the safety, privacy, transaction, and external-write boundaries below remain binding.

## 2. Recommended Stack

| Layer                        | Choice                                                                                        | Reason                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                     | Next.js                                                                                       | Common, agent-friendly, deploys easily                                                                                                                                                                                             |
| Hosting                      | Vercel Hobby initially                                                                        | Low fixed cost, simple deployment                                                                                                                                                                                                  |
| Database/Auth                | Supabase                                                                                      | Postgres + Auth + RLS + local DB dev via Supabase tooling                                                                                                                                                                          |
| Server logic (baseline)      | Next.js Route Handlers (ADR 0001 also permits Server Actions; none are in the codebase today) | One authoritative domain/security layer in `apps/web`; secrets and integrations stay server-side. Multiple clients (web UI, headless CLI) consume it through shared, versioned contracts — see `adr/0006-multi-client-doctrine.md` |
| Server logic (ADR exception) | Supabase Edge Functions                                                                       | Optional by default; use for cron or integrations that cannot live safely in Next (see `adr/0001-v1-server-boundary.md`)                                                                                                           |
| AI                           | OpenAI Responses API + Structured Outputs                                                     | Typed AI output and tool-ready interaction model                                                                                                                                                                                   |
| Calendar                     | Google Calendar API                                                                           | Free/busy checks and approved event writes                                                                                                                                                                                         |
| Background jobs              | None by default; Supabase Cron + Edge Functions only when justified                           | Avoid background complexity                                                                                                                                                                                                        |

## 3. Runtime Architecture

```text
Web moments UI
  -> WorkflowContext: reducer state, identity, persistence coordination
     -> workflow/*: deterministic local transitions
     -> IndexedDB: raw capture queue, pending writes, pending task drafts
     -> data/workflow/* -> user-scoped Supabase client -> Postgres + RLS
     -> Next.js Route Handlers -> AI / Google Calendar adapters

Headless CLI
  -> /api/v1/* -> verified bearer identity -> shared data layer -> RLS
  -> /api/parse-capture -> existing parse service (separate from raw save)

Server provider boundaries
  -> AI context assembly -> provider adapter -> output validation
  -> explicit calendar approval -> Google adapter -> local placement RPC
     + external-write audit and bounded reconciliation
```

Optional, not the default path: **Supabase Edge Functions** for scheduled jobs or specific integrations — see `adr/0001-v1-server-boundary.md`.

The web client's existing Supabase data-layer calls are the migration exception in [ADR 0006](adr/0006-multi-client-doctrine.md). That ADR permits the web client to migrate later; new headless clients use server contracts. [CLI transport](../packages/cli/src/api.ts) calls `/api/v1` for account data and the existing `/api/parse-capture` route for parsing. The parse call does not create workflow records, but the server may record AI-call traces. Neither client owns vendor credentials or a second implementation of domain rules.

## 4. Why No Separate Backend by Default

Do not add a separate Node/Express/Nest backend without a superseding reviewed ADR. Application logic lives in **Next.js** — today entirely in **Route Handlers**; ADR 0001 also permits Server Actions, but the codebase contains none. **Supabase** provides the database, auth, RLS, and migrations; it is not a second application server for core CRUD and AI flows.

Supabase still provides:

- auth
- database
- Row Level Security
- local development tooling for Postgres
- optional Edge Functions and scheduled jobs **when** the ADR exception applies (cron or integration constraints)

Adding another backend beyond Next + Supabase data would increase cost, deployment complexity, secrets handling, and debugging overhead.

## 5. Repository Structure

```text
/apps
  /web
    /src
      /app          # route handlers, moments UI and layouts
      /components   # reusable presentation
      /lib          # domain, persistence and provider modules
/packages
  /cli
  /schemas
  /types
  /ui
  /utils
/supabase
  /migrations
  /seed
/docs
  /adr
    README.md (index) + 000N-*.md decision records
  PROJECT_STATE.md
  PRODUCT.md
  REQUIREMENTS.md
  ARCHITECTURE.md
  DATA_MODEL.md
  UX_FLOWS.md
  TEST_PLAN.md
  SECURITY_PRIVACY.md
```

Core workflows in the current baseline are implemented under `apps/web` (not under `supabase/functions`). Edge Functions under `/supabase/functions` are **optional and default-no**, unless an ADR documents a justified exception (cron or integration).

## 6. Core Architectural Components

### 6.1 Scope Resolver

Resolves policy values using:

```text
Item override → Area policy / learning → Global default
```

Used by:

- parser
- scheduler
- execution screen
- review
- health dashboard
- policy suggestions

This is the required precedence, not proof of a single shipped resolver used by every surface. The source owner map below identifies concrete area-learning owners. A consolidated resolver for all listed consumers was not established by this source check.

### 6.2 Workflow Engine

Handles deterministic app state:

- capture status
- task status
- proposal status
- block status
- session status
- review status

This logic should not live inside prompts.

### 6.3 AI Orchestration Layer

Responsible for:

- schema-constrained parsing
- ambiguity assessment
- first-move generation
- priority scoring
- review summaries
- repair-guide explanations

Rules:

- all mutation-producing AI calls must use strict schemas
- AI output must validate before persistence
- failed validation becomes a recoverable error
- AI never directly performs external writes

### 6.4 Scheduling Suggestion Engine

Creates local proposals using:

- task estimate range
- area time preferences
- declared user constraints
- Google free/busy information
- missed-block history
- productivity patterns

V1 rule:

- suggest slots
- flag conflicts
- do not solve all conflicts automatically

### 6.5 Calendar Integration Adapter

Single wrapper around Google Calendar.

Allowed operations in V1:

- free/busy query
- insert event after approval
- update/cancel only after explicit user action

Do not sync the entire calendar.

### 6.6 Health Engine

Rule-based scoring for:

- auth
- database
- AI parsing
- calendar connector
- scheduler
- priority model
- duration model
- time preference model

AI may generate explanation text, but not the score.

### 6.7 Audit Layer

Logs:

- AI recommendations
- user decisions
- external writes
- policy changes
- overrides
- failed writes
- health incidents

Audit logs are essential for debugging future AI-agent changes.

## 7. AI Architecture

### 7.1 Stable Contract

The stable contract is not the model name.

The stable contract is:

- prompt version
- input schema
- output schema
- validation rules
- confidence thresholds
- error handling
- audit records

### 7.2 Model Routing

Use environment-configured model tiers:

| Tier                | Use                                                              |
| ------------------- | ---------------------------------------------------------------- |
| `AI_MODEL_CHEAP`    | area inference, labels, simple scoring                           |
| `AI_MODEL_STANDARD` | capture parsing, ambiguity assessment, block proposals           |
| `AI_MODEL_STRONG`   | complex weekly review, prompt/schema evaluation, admin debugging |

Do not hardcode exact model names in app logic.

### 7.3 Structured Output Schemas

Required schemas:

- `ParseCaptureResponse`
- `AmbiguityAssessmentResponse`
- `TriageSuggestionResponse`
- `BlockProposalResponse`
- `WeeklyReviewResponse`
- `PolicySuggestionResponse`
- `HealthNarrativeResponse`

### 7.4 AI Safety Rules

- Do not send more data than needed.
- Use `store: false` where supported.
- Never trust AI output without validation.
- Persist AI recommendations separately from committed user decisions.
- Every AI suggestion should expose confidence and rationale.

## 8. Background Jobs

Default: no always-on automation.

Allowed later:

- daily health sweep
- weekly review draft
- token validity check

Prefer **Supabase Cron** invoking **Edge Functions** for recurring jobs when those jobs truly belong off the Next runtime; otherwise prefer a minimal **Vercel cron** calling a **secured Route Handler** if that stays simpler for V1. Avoid depending on Vercel Hobby cron for precise or frequent jobs without checking limits.

## 9. Deployment Environments

### Local

- Supabase local dev
- local Next.js
- mock calendar adapter
- mock AI adapter for tests

### Preview

- Vercel preview deployment
- Supabase preview or separate dev project
- no production calendar writes unless explicitly configured

### Production

- Vercel Hobby/Pro as needed
- Supabase project
- Google OAuth configured
- environment secrets stored server-side

## 10. Observability

Minimum logging:

- Next.js Route Handler invocation success/failure (and Edge Function invocations if used; Server Actions, should any ever be added under ADR 0001, log the same way)
- AI validation failures
- calendar write attempts
- calendar write failures
- health check results
- RLS/security errors
- uncaught frontend errors

Do not log:

- full raw captures in external log drains
- access tokens
- secrets
- full AI prompts containing private data

## 11. Architecture Decision Records

Architecture Decision Records live under `docs/adr/`. The authoritative list is [adr/README.md](adr/README.md), including each decision's supersession status.

Additional invariants:

| Decision                                                                                                     | Status   |
| ------------------------------------------------------------------------------------------------------------ | -------- |
| Use Supabase for data/auth instead of a separate backend service                                             | Accepted |
| Use local proposals before calendar writes                                                                   | Accepted |
| Keep external writes approval-gated                                                                          | Accepted |
| Use strict schemas for AI output                                                                             | Accepted |
| One authoritative domain/security layer; clients never bypass it (ADR 0006)                                  | Accepted |
| No in-app multi-agent runtime today; future scope only via its own owner-ratified ADR + issue (ADR 0006)     | Accepted |
| Keep realtime voice unapproved unless a reviewed requirement preserves privacy, cost, and consent boundaries | Accepted |
| Avoid full calendar sync                                                                                     | Accepted |

## 12. Business-rule owners

Change a rule in its owner. Transport and display code may translate inputs or render results, but must not become another rule implementation. A module split may preserve this boundary; filenames themselves are not immutable. The two `workflow.ts` files are public re-export surfaces, not monolithic owners.

| Business rule                    | Owner and responsibility                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity and input contracts       | [schemas](../packages/schemas/src/index.ts), including strict parse contracts; [types](../packages/types/src/index.ts) re-exports inferred types.                                                                                                                                                                                                                                                                |
| Local workflow transitions       | [workflow barrel](../apps/web/src/lib/workflow.ts) exposes stage owners in `workflow/`: capture, triage, planning, execution, review and task maps.                                                                                                                                                                                                                                                              |
| Work-in-progress admission       | [triage](../apps/web/src/lib/workflow/triage.ts) uses [wip](../apps/web/src/lib/workflow/wip.ts); the policy identifier and limit live in [shared](../apps/web/src/lib/workflow/shared.ts).                                                                                                                                                                                                                      |
| Raw-save-first capture           | [capture data module](../apps/web/src/lib/data/workflow/capture.ts) persists raw text; [offlineQueue](../apps/web/src/lib/capture/offlineQueue.ts) retains unsent captures. The [capture route](../apps/web/src/app/api/v1/captures/route.ts) validates and saves without invoking parsing.                                                                                                                      |
| UI/account coordination          | [WorkflowContext](../apps/web/src/lib/WorkflowContext.tsx) and [persistenceSync](../apps/web/src/lib/workflowContext/persistenceSync.ts) coordinate reducer state, ID mappings and delivery status. Stage rules remain in the domain modules.                                                                                                                                                                    |
| Durable delivery                 | [pendingWriteJournal](../apps/web/src/lib/durability/pendingWriteJournal.ts) owns enqueue/order/attempt bookkeeping. [durableWrites](../apps/web/src/lib/durability/durableWrites.ts) owns handlers, payload interpretation and local-to-account ID resolution.                                                                                                                                                  |
| Pending task drafts              | [draftStore](../apps/web/src/lib/durability/draftStore.ts) retains undecided work and decision markers. These drafts are not pending account writes.                                                                                                                                                                                                                                                             |
| Draft acceptance                 | [syncJournaledTaskDraftAccept](../apps/web/src/lib/data/workflow/draftAccept.ts) coordinates people, task, optional proposal and capture status. Main still sequences replayable writes; this is the INV-1 gap in section 15.                                                                                                                                                                                    |
| Atomic account transitions       | SQL functions in [workflow transitions](../supabase/migrations/20260612120000_add_workflow_transition_functions.sql), with later replacements such as [plan/draft write identities](../supabase/migrations/20260727130000_add_plan_and_draft_client_write_ids.sql). [Data-layer callers](../apps/web/src/lib/data/workflow.ts) validate and call RPCs. Read the full migration chain before changing a function. |
| Route identity and authorization | [requireSupabaseServerUser](../apps/web/src/lib/supabase/server.ts) verifies bearer identity and supplies a scoped client; [data helpers](../apps/web/src/lib/data/workflow/shared.ts) verify user context; Postgres RLS enforces row ownership.                                                                                                                                                                 |
| Headless transport               | [CLI api](../packages/cli/src/api.ts) owns HTTP calls; [CLI auth](../packages/cli/src/auth.ts) owns session acquisition. [Boundary tests](../packages/cli/src/boundary.test.ts) prohibit table/RPC access and service-role use.                                                                                                                                                                                  |
| AI context and output            | [contextAssembly](../apps/web/src/lib/ai/contextAssembly.ts) owns prompt/context assembly. [parseCapture](../apps/web/src/lib/ai/parseCapture.ts) validates parse output against [contracts](../apps/web/src/lib/ai/contracts/parseCapture.ts). [provider/openai](../apps/web/src/lib/ai/provider/openai.ts) owns vendor transport.                                                                              |
| Calendar approval and delivery   | [create route](../apps/web/src/app/api/google-calendar/create-event/route.ts) and [cancel route](../apps/web/src/app/api/google-calendar/cancel-event/route.ts) enforce request/approval checks. [events](../apps/web/src/lib/googleCalendar/events.ts) owns Google operations; [planning/server](../apps/web/src/lib/planning/server.ts) records local placement.                                               |
| External-write audit and repair  | [externalWrites/server](../apps/web/src/lib/externalWrites/server.ts) records attempts/results; [reconciliation](../apps/web/src/lib/externalWrites/reconciliation.ts) repairs a bounded subset of stale pending inserts. Event-ID derivation currently has duplicate owners; see section 15.                                                                                                                    |
| Health interpretation            | [data/health](../apps/web/src/lib/data/health.ts) derives checks and incidents deterministically. Provider metadata or a bounded history sample is not complete live-provider proof.                                                                                                                                                                                                                             |
| Area learning                    | [durationRecalibration](../apps/web/src/lib/learning/durationRecalibration.ts) computes evidence-based adjustments; [overrideScan](../apps/web/src/lib/learning/overrideScan.ts) groups evidence by policy and area to propose changes.                                                                                                                                                                          |
| Export                           | [data/export](../apps/web/src/lib/data/export.ts) owns table inclusion and format version; the [export route](../apps/web/src/app/api/export/route.ts) supplies the user-scoped client. Inclusion and complete row retrieval are separate properties.                                                                                                                                                            |
| Derived cockpit state            | [cockpit/viewModel](../apps/web/src/lib/cockpit/viewModel.ts) and [buildTodayCockpitModel](../apps/web/src/lib/today/buildTodayCockpitModel.ts) derive presentation from workflow state. They do not independently decide transitions.                                                                                                                                                                           |

## 13. Persistence tiers and invariant checks

| Tier                            | Meaning and limit                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account Postgres rows           | Durable account state, subject to schemas, authorization, RLS and transition functions. A local UI update does not establish that these rows changed. |
| IndexedDB capture queue         | Unsent raw captures keyed by `client_capture_id`. Retrying must preserve that identity.                                                               |
| IndexedDB pending-write journal | Writes owed to the account, with stable `client_write_id`, original action time and handler payload. Failed or unhandled attempts remain queued.      |
| IndexedDB task drafts           | Work in progress with no pending-draft server destination. Decision markers prevent a stale pending copy from resurrecting a decided draft.           |
| Reducer/sessionStorage          | A per-tab working view. It is neither account confirmation nor a replacement for the device stores.                                                   |

“Saved on this device” requires a completed device write. “Saved to your account” requires confirmation for the **same action**, not the replay loop's total success count. [hasPendingWrite](../apps/web/src/lib/durability/durableWrites.ts) makes that distinction. Browser storage does not protect against device loss or cleared browser data. RLS protects server rows; it does not itself partition browser storage or bind asynchronous work to an account. Do not infer those properties from this tier map.

The following table maps existing requirements to enforcement and limits. It does not create another invariant registry. Tests named here are checks to use, not a claim that they were run for this document.

| Required property                                                                                | Owner/check                                                                                                                                                                                                                                                            | Limit to preserve in claims                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-table atomicity ([INV-1](ENGINEERING_INVARIANTS.md#inv-1--atomic-multi-table-transitions)) | Transition RPCs and [two-user RLS tests](../apps/web/src/__tests__/phase4aRls.local.test.ts).                                                                                                                                                                          | Draft acceptance remains an implementation conflict, not an approved exception. A retry test does not prove rollback.                    |
| Complete export ([INV-2](ENGINEERING_INVARIANTS.md#inv-2--export-coverage))                      | [engineeringInvariants](../apps/web/src/__tests__/engineeringInvariants.test.ts) checks table inclusion; [export tests](../apps/web/src/lib/data/export.test.ts) include an expected-failure cap regression.                                                           | Table coverage does not prove retrieval past the API row cap. An expected failure records an unresolved defect, not a successful export. |
| Vendor separation and reachable views (INV-3, INV-5)                                             | [engineeringInvariants](../apps/web/src/__tests__/engineeringInvariants.test.ts), [sourceOfTruth](../apps/web/src/__tests__/sourceOfTruth.test.ts), [.dependency-cruiser.cjs](../.dependency-cruiser.cjs).                                                             | Static guards cover declared boundaries; some UI data-access rules remain warnings.                                                      |
| Raw-save-first capture                                                                           | [capture route tests](../apps/web/src/app/api/v1/captures/route.test.ts), [captureParseFlow tests](../apps/web/src/lib/captureParseFlow.test.ts).                                                                                                                      | Parsing failure must retain the saved capture. Input normalization follows schemas; this is not a universal byte-preservation claim.     |
| Stable retries and truthful save status                                                          | [pendingWriteJournal tests](../apps/web/src/lib/durability/pendingWriteJournal.test.ts), [durableWrites tests](../apps/web/src/lib/durability/durableWrites.test.ts), [durablePlansDraftsGuard](../apps/web/src/__tests__/durablePlansDraftsGuard.test.tsx).           | Stable write IDs and exact-action confirmation do not guarantee exactly-once execution of every audit or learning side effect.           |
| Account isolation                                                                                | Scoped clients, ownership policies and [two-user RLS tests](../apps/web/src/__tests__/phase4aRls.local.test.ts).                                                                                                                                                       | Database enforcement needs an isolated full-migration test. Local queues, snapshots and account-switch races need their own tests.       |
| AI validation and untrusted-data separation (INV-8, NS-INV-1)                                    | [injectionContainment](../apps/web/src/lib/ai/injectionContainment.test.ts), [contextAssemblyChokePoint](../apps/web/src/__tests__/contextAssemblyChokePoint.test.ts), strict shared schemas.                                                                          | These prove pipeline structure, not factual correctness or immunity of a real model.                                                     |
| Least AI context (INV-9)                                                                         | [contextAssembly.budget tests](../apps/web/src/lib/ai/contextAssembly.budget.test.ts).                                                                                                                                                                                 | Representative-fixture budgets are not runtime request ceilings.                                                                         |
| Approved, auditable external writes                                                              | [create route tests](../apps/web/src/app/api/google-calendar/create-event/route.test.ts), [cancel route tests](../apps/web/src/app/api/google-calendar/cancel-event/route.test.ts), [reconciliation tests](../apps/web/src/lib/externalWrites/reconciliation.test.ts). | Same-proposal retry identity does not prove sibling-proposal uniqueness or recovery of every partial failure.                            |
| Deterministic health and evidence-gated learning (INV-6, INV-10)                                 | [health tests](../apps/web/src/lib/data/health.test.ts), [overrideScan tests](../apps/web/src/lib/learning/overrideScan.test.ts), [durationRecalibration tests](../apps/web/src/lib/learning/durationRecalibration.test.ts).                                           | A merged policy kernel is not a shipped autonomous feature. The trust ladder and approval gates still apply.                             |

## 14. Behaviors that must survive refactoring

- **Identity and compatibility:** preserve canonical schemas, export format version, versioned API contracts, `client_capture_id`, `client_write_id` and the draft acceptance `:proposal` identity. Stored rows and retries depend on them. [ADR 0006](adr/0006-multi-client-doctrine.md) governs breaking API changes.
- **Replay semantics:** preserve original action time, explicit local-to-account ID resolution, and exact-attempt removal. [pendingWriteJournal](../apps/web/src/lib/durability/pendingWriteJournal.ts) attempts writes in sequence but continues after failures. Its promise tail serializes one JavaScript runtime, not every tab. Database idempotency and handler dependency checks remain necessary.
- **Undo after uncertain delivery:** an original may already exist remotely after a lost response. [durableWrites](../apps/web/src/lib/durability/durableWrites.ts) distinguishes cancelling an unsent local pair from replaying an account-capable original followed by its compensating action. Do not erase both merely because their UI effects cancel.
- **Consent and provider identity:** approval binds to the proposed time; Google event IDs, ownership markers and ETags support retries and safe cancellation. Insert and reconciliation must agree on event identity, including historical IDs. Preserve known remote success when account follow-up fails.
- **Privacy boundaries:** keep untrusted capture content separate from trusted prompt instructions, keep privileged clients server-side, and retain explicit user filters for [workflowServerLoad](../apps/web/src/lib/data/workflowServerLoad.ts) when using a service-role client. RLS does not protect privileged reads that bypass it.

These contracts protect behavior, not every edit to the named files. A change to protected behavior needs the existing requirements/ADR and review process in [AGENTS.md](../AGENTS.md).

## 15. Current weak points and repair triggers

These are source observations at the revision above, not accepted policy exceptions or proven production incidents. **Observed** means the mechanism is present in source. **Suspected** describes its untested consequence. Repair triggers identify when a limitation must be resolved; they do not authorize new work or defer existing safety obligations. Live issue/PR status belongs in the work tracker, not this table.

| Weak point                                                  | Current evidence                                                                                                                                                                                                                                                                                                                                                                | Repair trigger and decisive check                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft acceptance is replayable, not atomic                  | **Observed:** [draftAccept](../apps/web/src/lib/data/workflow/draftAccept.ts), `syncJournaledTaskDraftAccept`, sequences person/task/proposal/capture writes despite INV-1. Its rationale is reuse of TypeScript normalization, not an approved exception.                                                                                                                      | Before asserting atomic acceptance: fail each dependent step and verify rollback plus safe retry from a fresh runtime. Normalize inputs outside the transaction if needed, but keep dependent persistence together. |
| Cancellation can misstate known remote success              | **Observed:** the [cancel route](../apps/web/src/app/api/google-calendar/cancel-event/route.ts) deletes remotely before local cancellation and audit completion. Its generic catch writes `event_deleted: false` to the failed audit summary. **Suspected:** a later local failure misreports a successful delete.                                                              | Before trusting cancellation recovery: inject local/audit failure after a successful mocked delete. Preserve remote outcome, distinguish incomplete local follow-up, and test repair.                               |
| Sibling approvals lack a proven shared external reservation | **Observed:** the [create route](../apps/web/src/app/api/google-calendar/create-event/route.ts) checks siblings before insertion; the task lock in [record_google_calendar_placement](../supabase/migrations/20261017120000_record_google_calendar_placement.sql) follows the provider call. IDs are per proposal. **Suspected:** concurrent siblings create two remote events. | Before claiming one event per task: barrier-controlled sibling requests must prove remote uniqueness, refusal behavior and auditable recovery. Same-proposal retries are insufficient.                              |
| Project draft decisions lack durable wiring                 | **Observed:** [WorkflowContext](../apps/web/src/lib/WorkflowContext.tsx) accepts/rejects project drafts locally; [workflowServerLoad](../apps/web/src/lib/data/workflowServerLoad.ts) returns `projects: []`; durable handlers omit project decisions. A project creation helper alone is not consumer wiring.                                                                  | Before promising cross-session project continuity: define its storage tier and verify acceptance survives a fresh tab/account read.                                                                                 |
| Export can stop at the API cap                              | **Observed:** [buildUserDataExport](../apps/web/src/lib/data/export.ts) makes one unpaged select per table; [local API config](../supabase/config.toml) sets `max_rows = 1000`. **Suspected:** larger tables export incompletely; production limits were not inspected.                                                                                                         | Before claiming volume-independent completeness: export more than the cap and compare all IDs, including changing-page conditions, while excluding secret tables.                                                   |
| AI fixture budgets do not limit real requests               | **Observed and documented:** [INV-9](ENGINEERING_INVARIANTS.md#inv-9--per-surface-ai-context-budgets-representative-fixture-guard-wired-absolute-runtime-ceiling-open) and [contextAssembly](../apps/web/src/lib/ai/contextAssembly.ts) provide no absolute assembled-context ceiling.                                                                                          | Before adding large context sources or claiming a privacy/cost ceiling: define rejection/truncation semantics and test oversized inputs without losing raw captures.                                                |
| Health samples the oldest traces in its lookback            | **Observed:** [data/health](../apps/web/src/lib/data/health.ts) orders traces ascending and limits to 200 in a rolling 24-hour lookback. **Suspected:** later failures/recovery fall outside the sample at higher volume.                                                                                                                                                       | Before treating health as a complete provider assessment: place failures and recovery beyond the first 200 traces in the configured lookback and verify incident/freshness results.                                 |
| Calendar event-ID derivation has two owners                 | **Observed:** [events](../apps/web/src/lib/googleCalendar/events.ts) and [reconciliation](../apps/web/src/lib/externalWrites/reconciliation.ts) duplicate the deterministic formula. No current mismatch is asserted.                                                                                                                                                           | Before changing either formula: one pure owner plus golden historical IDs must prove insertion, lookup and cancellation agree.                                                                                      |
| WorkflowContext concentrates coordination                   | **Observed:** [WorkflowContext](../apps/web/src/lib/WorkflowContext.tsx) spans several thousand lines, outside INV-4's route-page budget. [.dependency-cruiser.cjs](../.dependency-cruiser.cjs) makes direct moments-component data access warning-only. This is maintenance pressure, not a page-budget violation.                                                             | When a business rule needs edits in context, UI and a stage module: move the rule to its domain owner with behavioral and dependency-boundary tests. Avoid an unrelated orchestration rewrite.                      |

External-write recovery is deliberately narrower than “all writes reconcile.” [reconciliation](../apps/web/src/lib/externalWrites/reconciliation.ts) selects stale pending **inserts**. The create route's successful remote insert with `follow_up: "account_record_failed"` is audited as succeeded, so that pending-only reconciler does not repair it. Delete recovery also needs separate proof.

## 16. Maintaining the architecture record

When an owner, boundary or weakness changes, update the corresponding row with the implementation. Keep enforcement in [ENGINEERING_INVARIANTS.md](ENGINEERING_INVARIANTS.md), rationale in [ADRs](adr/README.md), delivery state in [PROJECT_STATE.md](PROJECT_STATE.md), and acceptance tiers in [TEST_PLAN.md](TEST_PLAN.md). Do not infer completion from a policy kernel, passing mock suite, or open PR.

For documentation edits, use the existing doc registry, link-integrity and public-evidence guards plus formatting. For behavior changes, use the named tests above and the appropriate runtime layer: isolated full-migration/two-user tests for RLS and transactions, mock provider failure/concurrency tests for calendar, and browser or deployed proof only for claims that require them. [.github/workflows/ci.yml](../.github/workflows/ci.yml) defines CI execution; its presence alone is not a passing run.

## Reference Links

These documents are intentionally grounded in stable platform capabilities, not hardcoded vendor-specific hype.

- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Responses API migration / `store: false`: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Google Calendar Freebusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy
- Google Calendar Events Insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Vercel Cron Jobs / Hobby limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Anthropic Building Effective Agents: https://www.anthropic.com/research/building-effective-agents
