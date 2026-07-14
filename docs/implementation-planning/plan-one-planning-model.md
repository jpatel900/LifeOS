STATUS: DESIGN NOTE for epic #555 item 4 — ratified by the owner's 2026-07-14 decision "planning: placement wins". Implementation may start once this merges.

# One planning model — placement wins

Binding sources: owner decision 2026-07-14; `docs/REQUIREMENTS.md` FR-008 (amended in the same PR as this note); audit `docs/design/ux-audit-2026-07-13-codex.md` (P0 "two competing mental models", Planning 3/10).

## Diagnosis (audit-verified)

Parsing auto-creates a proposal (e.g. 12pm); the user then places the task
directly at 8am on the hour rail; the 12pm proposal stays active and the UI
warns that accepting it would add ANOTHER block. The user must hold two
scheduling models. Mobile compounds it: ~11 empty hour cards before "To
place" (2,040px empty plan page).

## Principle

**Placing a task on an hour is THE scheduling action.** Proposals are
suggestions that feed placement — never a second source of scheduled truth.

## Design

1. **Placement supersedes.** `planTaskAtHour` (and any placement path) marks
   every pending proposal for that task `superseded` in the same state
   transition. Reversible, never deleted, visible in history.
2. **Accept = place.** Accepting a proposal calls the placement path with the
   proposal's start/end (one code path; the accept button becomes sugar).
   Edit-then-accept follows the same funnel.
3. **Invariant:** a task never simultaneously has an active proposal and a
   scheduled block. Guard test enforces it at the state layer
   (WorkflowContext) so no surface can recreate the split.
4. **Mobile task-first Plan:** below `sm:`, the Plan surface leads with the
   "To place" task list; the hour rail collapses to placed/conflicting hours
   plus a "show empty hours" disclosure. No 2,000px empty scroll.
5. **Copy truth:** the "accepting adds another block" warning dies with the
   dual model — conflicts remain advisory per FR-008.

## Non-goals

No change to external-calendar approval gates (Flow 8), no schema change
(proposal `status` already supports `superseded`), no AI behavior change.

## Oracle

- State guard test: place task with pending proposal → proposal superseded,
  exactly one block; accept proposal → identical end state via the same path.
- e2e: the audit's journey (parse → proposal exists → place at 8am) ends with
  ONE scheduled block, zero active proposals, no warning copy.
- Mobile: Plan at 390px shows "To place" in the first viewport.
- Experience gate: screenshots 1280 + 390 before/after.

## Effort and sequencing

L (state layer + Plan surfaces in both shells). Touches WorkflowContext,
plan/calendar surfaces, moments PlanSheet — serialize behind the #573/#574
chain (shared files). One slice: state model + guard first; mobile task-first
Plan may split into a second slice if the first grows.
