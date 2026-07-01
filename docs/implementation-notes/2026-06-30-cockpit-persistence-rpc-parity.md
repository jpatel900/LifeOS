# Cockpit Persistence RPC Parity - 2026-06-30

Status: implemented in `ui/handoff-cockpit-pass`

## Scope

- Added transactional Supabase RPCs for cockpit persistence parity where local UI actions previously only updated session state:
  - `start_execution_session`
  - `unplan_calendar_block`
  - `apply_task_review_transition`
- Replaced `accept_time_block_proposal` so local proposal acceptance also marks the related task `scheduled`.
- Wired `WorkflowProvider` to persist manual proposal create/edit/reject/accept, unplan, backlog promotion, review carry-forward/defer/drop, and daily review save when a Supabase session is available.

## Boundaries

- No new tables, policies, OAuth scopes, Google calls, AI calls, or schema-contract expansions.
- Google-backed block unplanning/task transitions intentionally fail with a plain approval-boundary error. Calendar update/cancel remains deferred follow-up scope.
- Draft rejection/edit/split/merge still do not create durable audit rows; they remain local/session workflow state unless product requirements change.

## Verification

- `supabase db reset` applied the full migration stack including `20260630180000_add_cockpit_persistence_transition_functions.sql`.
- `RUN_SUPABASE_RLS_TESTS=1 ... pnpm --filter @lifeos/web test -- phase4aRls.local` passed 20/20 against local Supabase on `http://127.0.0.1:15431`.
- `pnpm --filter @lifeos/web test -- workflow.test WorkflowContext.areas phase4aRls.local` passed with local RLS skipped in the non-live run.

## Follow-Up

- Keep Google Calendar update/cancel, AI/env-backed capture, audio capture, and weekly calibration deferred until explicitly reopened.
- If proposal rationale editing needs persistence, expand `EditTimeBlockProposalInputSchema` deliberately; this slice only persists proposed start/end edits because that is the current data helper contract.
