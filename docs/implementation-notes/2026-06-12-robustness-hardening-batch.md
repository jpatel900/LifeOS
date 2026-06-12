# 2026-06-12 — Robustness hardening batch

Status: Implemented locally; migration requires local Supabase verification and human review before merge
Scope: Transactional workflow transitions, AI provider boundary, user data export (FR-016), calendar page logic extraction

## What changed

### 1. Transactional workflow transitions (risky surface: migration)

- `supabase/migrations/20260612120000_add_workflow_transition_functions.sql` adds two `SECURITY INVOKER` Postgres functions so multi-table transitions commit or roll back atomically. RLS policies are unchanged and still apply inside the functions; `anon` and `public` execute grants are revoked, `authenticated` granted.
  - `accept_time_block_proposal(p_proposal_id)` — status guard, proposal update, calendar-block insert in one transaction. Previously two client calls; a failure between them stranded an accepted proposal with no block.
  - `apply_execution_session_outcome(...)` — session patch plus dependent calendar-block and task status transitions in one transaction. The completed→done / skipped→missed / blocked→blocked mapping moved from `workflow.ts` into the function so it cannot half-apply; paused-state patch derivation stays in `executionMarkPatch` in app code.
- `apps/web/src/lib/data/workflow.ts`: `acceptTimeBlockProposal` and `markExecutionSession` now call the RPCs; `MinimalSupabaseClient` gains an optional `rpc` member. Mock-mode behavior unchanged.

### 2. AI provider boundary

- New `apps/web/src/lib/ai/provider/` (types, `openai.ts`, resolver). OpenAI Responses API specifics (URL, request body, output extraction, telemetry) moved behind a `StructuredOutputProvider` interface resolved from `AI_PROVIDER` env (default `openai`; unknown values fail with a clear message). OpenAI remains the documented product provider — this is a seam, not a provider change.
- `parseCapture.ts` delegates to the provider; public API, error messages, and schema validation are unchanged. `parseCaptureService.ts` records the resolved provider id in traces instead of a hardcoded string. `TraceParseCaptureInput.provider` widened to `string`.

### 3. User data export (FR-016, added to REQUIREMENTS.md)

- `apps/web/src/lib/data/export.ts` + `GET /api/export` (bearer-token auth mirroring the freebusy route; user-scoped client so RLS bounds the export). Exports all 13 user-owned workflow tables; `google_calendar_connections` is excluded so token material never leaves the database. Whole-export fails (nothing partial) on any table error.
- `/settings/areas` gains a quiet `Data export` disclosure (`DataExportPanel`) between Google Calendar admin and Local reset.

### 4. Calendar page logic extraction

- ~300 lines of pure module-level helpers moved from `apps/web/src/app/calendar/page.tsx` (1,849 → ~1,550 lines) into `apps/web/src/lib/planning/presentation.ts` with focused tests. No render-structure or copy changes. Pattern to repeat opportunistically for `capture/page.tsx` and `lib/data/workflow.ts`.

## Proof

- `pnpm lint` ✅, `pnpm type-check` ✅, `pnpm test` ✅ (320 passed, 15 RLS suite skipped as designed), `pnpm build` ✅.
- `tests/e2e/p0-ux-regression.spec.ts` ✅ (15 passed with these changes).
- `tests/e2e/areas-color-edit.spec.ts` has 2 failures that reproduce on a clean `main` checkout (verified via stash) — pre-existing, unrelated to this batch. The preset color buttons inside `areas-area-card` time out.

## Limitations / required follow-up

1. The migration has NOT been run against a live database (Docker unavailable in this session). Before merge: `supabase db reset`, then run the opt-in RLS suite and exercise accept-proposal and mark-session flows against local Supabase.
2. The migration and the export route touch review-gated surfaces (migrations, new API surface); human review required per AGENTS.md §13.
3. Pre-existing `areas-color-edit.spec.ts` failures on `main` should be triaged separately.
4. RLS-level tests for the two RPCs (two-user denial cases) should be added to the opt-in local suite.
