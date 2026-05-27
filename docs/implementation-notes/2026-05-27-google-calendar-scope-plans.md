# Google Calendar Scope Plans

- Task name: Calendar planning closeout for all-day conflict checks and app-created update/cancel
- Branch: `verification/smoke-and-calendar-closeout`

## Original scope

Close the planning-only issues for:

- all-day event handling in conflict checks
- app-created Google Calendar event update/cancel after explicit approval

No implementation is authorized from this note.

## Assumptions

- `AGENTS.md` allows explicit-approval update/cancel of app-created events, but not silent writes, full sync, or autonomous rescheduling.
- Planning issues can close once the current repo behavior, exact scope boundary, risks, tests, and open human decisions are documented clearly.

## Decisions

- Treat the all-day issue as a conflict-check correctness and proof problem only. Do not frame it as rescheduling work because the repo does not ship autonomous rescheduling.
- Keep the next external-write phase limited to LifeOS-created Google Calendar events only, with explicit user action for every update or cancel.
- Preserve the current audit-first pattern: create/update/delete provider mutations must keep `external_write_events` truthfully aligned with success or failure.

## Verified current state

- `apps/web/src/app/api/google-calendar/freebusy/route.ts` validates signed-in user, connected calendar, and proposal status before checking conflicts.
- `apps/web/src/lib/googleCalendar/freebusy.ts` sends only `timeMin`, `timeMax`, and the selected calendar id to Google free/busy, then collapses the result to `checkedAt` and `hasConflict`.
- The repo currently has no explicit all-day-specific handling or regression coverage around all-day or timezone-edge conflict checks.
- `apps/web/src/app/api/google-calendar/create-event/route.ts` already enforces connected status, refresh-token presence, first-write warning acknowledgement, eligible proposal status, duplicate blocking, pending audit creation, provider write, local persistence only after provider success, and failed-audit updates on write failure.
- `apps/web/src/lib/googleCalendar/events.ts` uses deterministic Google event ids derived from the proposal UUID and writes a private `lifeos_proposal_id` extended property.

## Exact gap

- The repo does not currently prove that all-day external events are handled correctly across local-day and timezone-edge cases.
- The repo also does not yet support any explicit update/cancel path for LifeOS-created Google Calendar events after the initial insert.

## Proposed scope

### All-day conflict correctness

- First reproduce the problem with focused tests around all-day overlap and timezone boundaries.
- Keep any future fix at the free/busy helper/route/test level unless reproduction shows a broader data-model problem.
- Do not store raw provider payloads.
- Do not introduce autonomous rescheduling or conflict solving.

### App-created update

- Allow update only for blocks/proposals already linked to a LifeOS-created Google event.
- Require an explicit user action after the local proposal/block edit is visible.
- Write to Google first, then update local reflected state only after provider success.
- Record audit operation/result separately from the original insert.

### App-created cancel

- Allow cancel only for blocks/proposals already linked to a LifeOS-created Google event.
- Require explicit user confirmation.
- Delete or cancel at the provider first, then clear or transition local external-link state only after provider success.
- Record audit operation/result separately from update/insert.

## Open human decisions

- For all-day handling, should the future implementation normalize the checked window proactively or only after a reproduced failure shows Google free/busy semantics are insufficient for the current proposal timestamps?
- For cancel behavior, should a successful provider delete leave the local block accepted-but-local-only, or should it revert the proposal to an editable/pending state?
- For update behavior, should the UI allow pushing a local proposal edit directly to Google, or require an intermediate reviewed state before the explicit update click?

## Files likely touched in a future implementation

- `apps/web/src/app/api/google-calendar/freebusy/route.ts`
- `apps/web/src/lib/googleCalendar/freebusy.ts`
- `apps/web/src/app/api/google-calendar/create-event/route.ts` or sibling update/cancel routes
- `apps/web/src/lib/googleCalendar/events.ts`
- `apps/web/src/lib/planning/server.ts`
- `apps/web/src/lib/externalWrites/server.ts`
- `apps/web/src/app/calendar/page.tsx`
- focused route/data-layer/source-of-truth tests under `apps/web/src/__tests__`

## Validation commands and results

- Repo inspection only.
- No code/runtime changes made from this planning note.

## Risks

- The repo-level known issue about all-day handling may be overstated if the real gap is only missing proof, so any implementation should reproduce before broadening logic.
- Update/cancel work is still high-risk because it touches external writes, audit truthfulness, and local/provider state alignment.

## Deferred items

- Future implementation issue for all-day conflict correctness after human approval.
- Future implementation issue for app-created event update/cancel after human approval.

## Rollback notes

- Docs-only change. Revert the note and `PROJECT_STATE` update if the planning scope needs revision.
