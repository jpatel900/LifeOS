# Scenario Packs

Use scenario packs for T2 workflow behavior where correctness depends on externally checkable behavior, not just code review confidence.

## When required

Use a scenario pack for:

- cross-flow UX changes
- health behavior or meaning changes
- parser UI behavior
- observability display behavior
- workflow data behavior that remains inside approved T2 boundaries

## When not required

Do not force a scenario pack for:

- T0 docs work
- narrow T1 copy-only fixes
- trivial one-file cleanup with no workflow-behavior change

If unsure, prefer a small scenario pack over vague acceptance criteria.

## Required sections

Every scenario pack should include:

- scenario or user journey
- acceptance criteria
- failure paths
- out-of-scope boundaries
- required proofs:
  - unit/integration coverage
  - route smoke or browser proof when UI is touched
  - source-of-truth/static guard expectations when relevant
- rollback notes

## Proof mapping rule

Each acceptance criterion must map to at least one concrete proof artifact:

- test name or suite
- browser/manual walkthrough
- static/source-of-truth guard
- exact validation command

If a criterion has no proof path, the task is not ready for hands-off T2 discussion.

## Example: Calendar clarity

- Scenario: User reviews a local proposal on `/calendar`, sees a disconnected Google state, and decides whether to create an external event.
- Acceptance criteria:
  - The approval gate remains explicit.
  - The disconnected state is plain-language and actionable.
  - No automatic Google write occurs.
- Failure paths:
  - Google disconnected
  - duplicate create attempt
  - write failure after approval
- Out of scope:
  - no rescheduling
  - no new OAuth scopes
- Required proofs:
  - focused route tests for approval/disconnected states
  - browser/manual proof on `/calendar`
  - source-of-truth guard unchanged for Google write boundaries
- Rollback notes:
  - revert the calendar UX change and related tests only

## Example: Health status clarity

- Scenario: User opens `/health`, runs checks, and must distinguish informational optional-disabled states from actionable failures.
- Acceptance criteria:
  - Informational states do not read like failures.
  - Real failures remain explicit and actionable.
  - Health scoring logic does not change.
- Failure paths:
  - timeout
  - auth/data-read failure
  - optional provider disabled
- Out of scope:
  - no scoring formula changes
  - no new observability vendor
- Required proofs:
  - focused health tests
  - browser/manual proof on `/health`
  - source-of-truth guard unchanged for scoring boundaries
- Rollback notes:
  - revert the display-copy/status rendering change and related tests only
