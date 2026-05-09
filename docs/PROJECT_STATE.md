# PROJECT_STATE.md

## Current status

MVP supports task capture, area assignment, optional AI/mock parse capture, manual scheduling, execution tracking, basic review logging, and deterministic health checks. The Phase 2 mock vertical slice remains for fallback flows. Phase 5 parse capture is wired through a server route: `/capture` can persist raw `capture_items` first, then call the server-only Responses API parser when `OPENAI_API_KEY` and `AI_MODEL_STANDARD` are configured, or fall back to the mock parser when no API key is present. Parsed task/project drafts are local triage staging state for now, not durable draft rows; durability begins when triage accepts them into `tasks`/`projects`. Phase 4E persistence remains in place: `/settings/areas` reads Supabase-backed areas, `/triage` persists accepted task/project drafts to `tasks`/`projects`, `/calendar` can create/edit/reject/accept local `time_block_proposals` from persisted tasks, `/execute` persists `execution_sessions`, `/review` can create `review_entries` from persisted tasks/blocks/sessions, and `/health` shows deterministic subsystem checks from mock/Supabase/auth/app-state signals. These flows fall back to mock mode when Supabase env vars are absent.

## Recently completed

- Restored app route/provider integrity after the merge-conflict cleanup: root layout delegates to the client `apps/web/src/app/components/AppShell.tsx`, workflow routes render under `WorkflowProvider`, and the stale duplicate `apps/web/src/components/AppShell.tsx` was removed.
- Cleaned up AppShell/type source-of-truth drift: added a static guard for the single AppShell import boundary and renamed app-local Phase 2 mock/session view models so canonical entity types remain owned by `@lifeos/schemas`.
- Added route smoke coverage that renders workflow pages through the real app shell/provider instead of only manually wrapping pages in `WorkflowProvider`.
- Hardened `WorkflowProvider` so blocked or unavailable `sessionStorage` falls back to in-memory workflow state instead of crashing the app.
- Hardened `WorkflowProvider` hydration so structurally invalid persisted mock workflow JSON falls back to a fresh initial state instead of crashing primary screens.
- Merged `origin/main` into the inspection branch; resolved conflicts by adopting main’s codebase and dropping unused `getTasksByArea` / `getProposalsByArea` / `getCalendarBlocksByArea` from `mockData.ts` (UI uses workflow context instead).
- Task CRUD (mock path)
- Area model
- Basic calendar draft creation (mock path)
- Added always-on Cursor execution discipline rule for phase gating, plugin restrictions, mock preservation, schema strictness, required validation commands, and final risk/file summary expectations
- Refined plugin policy: strict no-plugin compliance when a prompt forbids plugins; otherwise plugins are allowed when appropriate to task and phase
- Added completion proof requirement for agent work: final handoff must show changed files, tests run, limitations, and docs-updated status
- Phase 2 mock workflow uses dedicated schema exports (`Phase2TimeBlockProposal`, etc.) separate from DB entity schemas in `@lifeos/schemas`
- Added local Supabase scaffold with `supabase/config.toml`, initial V1 schema migration, RLS policies, and seed guidance
- Added a migration contract test that checks required Phase 3 tables, RLS policies, and index coverage
- Added Supabase browser/server client helpers, provider-aware data functions, and `/settings/areas` plus `/capture` pages for Phase 4A (alongside Phase 2 mock workflow)
- Updated shared Zod schemas to validate Phase 4A `areas` and `capture_items` rows at app boundaries
- Added Phase 4A UI tests for Supabase-backed area reads, Supabase-backed capture saves, unauthenticated Supabase error states, and a static guard that browser persistence remains limited to `areas` and `capture_items` without service-role key references.
- Added local Supabase seed data for two Auth users and canonical starter areas, plus a local login page for RLS-backed Phase 4A smoke tests
- Aligned canonical V1 default areas across Phase 2 mock data, Phase 4A provider mock data, Supabase seed data, and tests: Main Job, Personal, Volunteer Work, Side Project.
- Phase 2 mock workflow restores `WorkflowState` from `sessionStorage`; the mock ID counter is resynced from persisted entities (`syncWorkflowIdCounterFromState`) on load and after each state update so generated IDs (`capture-*`, `task-*`, etc.) never reuse numeric suffixes after refresh or reset
- Added opt-in local Supabase RLS tests for Phase 4A `areas` and `capture_items`: user A can access own rows, cannot see user B rows, anon reads are denied, and cross-user capture inserts are blocked.
- Added Phase 4B accepted-draft persistence: triage accepts task drafts into `tasks` and project drafts into `projects`, validates create inputs and returned rows with `@lifeos/schemas`, and leaves rejected/deferred drafts uncommitted.
- Added a narrow Supabase migration granting authenticated Data API access for `areas`, `capture_items`, `projects`, and `tasks`; RLS policies remain unchanged.
- Added Phase 4B tests for task/project acceptance, reject-without-create behavior, mock fallback, source-of-truth boundaries, and opt-in local RLS coverage for `tasks` and `projects`.
- Added Phase 4C local planning persistence: `@lifeos/schemas` now validates proposal create/edit inputs, the data layer lists active tasks/proposals/blocks, creates proposals from persisted task rows, persists edit/reject/accept status changes, and inserts local `calendar_blocks` on acceptance.
- `/calendar` now uses persisted planning rows when Supabase is configured/authenticated and preserves the existing Phase 2 mock planning path when Supabase config is absent.
- Added a narrow Supabase migration granting authenticated Data API access for `time_block_proposals` and `calendar_blocks`; existing RLS policies remain unchanged.
- Added Phase 4C tests for task-to-proposal, proposal edit/reject/accept-to-block, migration grants, UI persistence, mock fallback route smoke, and opt-in local RLS coverage for proposals/blocks.
- Added Phase 4D execution/review persistence: `@lifeos/schemas` validates execution start/mark and review-entry inputs, the data layer persists `execution_sessions` and `review_entries`, `/execute` can start and mark persisted sessions, and `/review` reads persisted tasks/blocks/sessions before creating daily review entries.
- Added a narrow Supabase migration granting authenticated Data API access for `execution_sessions` and `review_entries`; existing RLS policies remain unchanged.
- Added Phase 4D tests for starting/completing/missing execution sessions, related task/block status updates, persisted review entry creation, route smoke coverage, and opt-in local RLS coverage for execution/review rows.
- Added Phase 4E deterministic health dashboard: `/health` now checks mock mode availability, Supabase config, auth/session state, area readability, capture persistence readability, AI parser not-configured status, and Google Calendar not-configured status without AI scoring.
- Added best-effort `health_checks` persistence for authenticated Supabase users, plus a narrow authenticated Data API grant for `health_checks`; existing RLS policies remain unchanged.
- Added helper tests for health status construction/persistence fallback, route smoke coverage for async health loading, static no-OpenAI/service-role guard coverage for the health path, migration grant coverage, and opt-in local RLS coverage for `health_checks`.
- Added Phase 5 parse-capture wiring: `apps/web/src/app/api/parse-capture/route.ts` calls the server-only parser, `store: false` remains enforced, invalid AI output fails safely, missing API key uses mock fallback, and `/capture` persists raw captures before adding parsed task/project drafts to triage.
- Tightened `ParseCaptureResponseSchema` for V1 Structured Outputs: explicit `parse_status`, top-level confidence/triage routing, required nullable fields, task/project drafts only, top-level clarification questions, and a nullable structured ambiguity assessment.
- Added guardrails for the intended Phase 5 staging model: `/capture` tests verify raw capture save happens before parsing and parsed drafts route into local triage state, while source-of-truth tests keep OpenAI parsing behind the server route.

## Known issues

- Rescheduling does not yet check all-day events.
- Mobile layout needs improvement.
- Supabase is scaffolded locally and Phase 4E UI uses it for areas, capture, accepted tasks/projects, local time-block proposals, local calendar blocks, execution sessions, review entries, and health check snapshots.
- Supabase-backed capture and accepted-draft saves require an authenticated Supabase user because RLS policies enforce `auth.uid() = user_id`.
- Persisted planning, execution, review, and health remain local-only. There is still no Google Calendar API, free/busy query, review/health narrative AI, autonomous scheduling, background job, advanced analytics, or conflict auto-solver.

## Next recommended tasks

1. Manually smoke `/login` with `user_a@example.test` / `password123`, then verify `/settings/areas`, `/capture` Save and parse, `/triage`, `/calendar`, `/execute`, and `/review` against local Supabase.
2. Start the next approved phase only after updating requirements/acceptance criteria; do not extend Phase 4C into Google Calendar/free-busy/external writes without explicit scope.
3. Add conflict detection tests.
4. Improve mobile task capture.
5. Add review log.

## Important implementation notes

- Domain types in `@lifeos/types` are re-exports of Zod-inferred types from `@lifeos/schemas`; `packages/types/src/schema-type-parity.ts` is a compile-time check that `Area`, `Capture`/`CaptureItem`, and other re-exports stay aligned (fails `tsc` if `index.ts` is replaced with divergent manual interfaces).
- App-local mock/session-only types use `Phase2Mock...` names in `apps/web/src/lib/types.ts`; do not reintroduce canonical names like `Task`, `Project`, `CalendarBlock`, `ExecutionSession`, or `HealthCheck` there.
- Task status and TimeBlock status are separate.
- Calendar events are never auto-deleted without confirmation.
- Agent guidance is now aligned across `AGENTS.md` and `.cursor/rules/execution-discipline.mdc` for phase-first implementation and completion checks.
- Phase 3 migration covers only the requested V1 tables: areas, capture items, projects, tasks, proposals, calendar blocks, execution sessions, review entries, health checks/incidents, suggestion records, and override records.
- RLS policies use `to authenticated` and `((select auth.uid()) = user_id)`; area/project/task references use same-user composite foreign keys to reduce cross-user contamination risk.
- Phase 4D data access falls back to mock data when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing.
- Phase 5 adds OpenAI only behind the server `/api/parse-capture` route. Browser components must not import `apps/web/src/lib/ai/parseCapture.ts`; they should call the route and use `parseCaptureWorkflow.ts` for client-safe conversion into triage state.
- AI parse-capture output is not committed as tasks/projects directly. It becomes reviewable local task/project drafts; accepted triage drafts still pass through the existing `createTask` / `createProject` Zod validation and Supabase RLS paths.
- Do not add durable draft persistence tables unless requirements explicitly change. Current intended flow is durable raw capture -> local parsed drafts -> durable accepted task/project.
- Local Supabase seed users both use password `password123`; User A has Main Job, Personal, Volunteer Work, and Side Project areas, while User B has a private area for RLS isolation checks.
- `supabase db reset` has been verified locally after the seed update.
- `apps/web/src/__tests__/phase4aRls.local.test.ts` is skipped by default; run it with `RUN_SUPABASE_RLS_TESTS=1`, local Supabase URL, and the local anon key from `supabase status -o env`. It now covers `areas`, `capture_items`, `tasks`, `projects`, `time_block_proposals`, `calendar_blocks`, `execution_sessions`, `review_entries`, and `health_checks`.
- `WorkflowProvider` should remain usable when browser storage is unavailable or contains invalid mock workflow state; persistence failures are intentionally swallowed after ID-counter sync.
- Triage maps Phase 2 mock area ids to persisted Phase 4 area slugs before saving accepted tasks/projects; `/calendar` creates persisted proposals from persisted task ids rather than from Phase 2 mock proposal draft ids.
