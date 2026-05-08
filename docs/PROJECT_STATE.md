# PROJECT_STATE.md

## Current status

MVP supports task capture, area assignment, and manual scheduling.

## Recently completed

- Aligned web mock `TimeBlockProposal` with `@lifeos/schemas` (`conflict_flag`, `created_at`) via re-export to avoid duplicate type shapes.
- Task CRUD
- Area model
- Basic calendar draft creation
- Added always-on Cursor execution discipline rule for phase gating, plugin restrictions, mock preservation, schema strictness, required validation commands, and final risk/file summary expectations
- Refined plugin policy: strict no-plugin compliance when a prompt forbids plugins; otherwise plugins are allowed when appropriate to task and phase
- Added completion proof requirement for agent work: final handoff must show changed files, tests run, limitations, and docs-updated status

## Known issues

- Rescheduling does not yet check all-day events.
- Mobile layout needs improvement.

## Implementation notes (recent)

- Phase 2 mock workflow restores `WorkflowState` from `sessionStorage`; the mock ID counter is resynced from persisted entities (`syncWorkflowIdCounterFromState`) on load and after each state update so generated IDs (`capture-*`, `task-*`, etc.) never reuse numeric suffixes after refresh or reset.

## Next recommended tasks

1. Add conflict detection tests.
2. Improve mobile task capture.
3. Add review log.

## Important implementation notes

- Task status and TimeBlock status are separate.
- Calendar events are never auto-deleted without confirmation.
- Agent guidance is now aligned across `AGENTS.md` and `.cursor/rules/execution-discipline.mdc` for phase-first implementation and completion checks.
