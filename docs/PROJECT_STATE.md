# PROJECT_STATE.md

## Current status

MVP supports task capture, area assignment, and manual scheduling.

## Recently completed

- Task CRUD
- Area model
- Basic calendar draft creation
- Mock workflow ID generation now survives browser reloads without reusing local record IDs.

## Known issues

- Rescheduling does not yet check all-day events.
- Mobile layout needs improvement.

## Next recommended tasks

1. Add conflict detection tests.
2. Improve mobile task capture.
3. Add review log.

## Important implementation notes

- Task status and TimeBlock status are separate.
- Calendar events are never auto-deleted without confirmation.
- Phase 2 mock workflow state is stored in `sessionStorage`; generated IDs must remain unique across module reloads.
