# Triage And Planning Workflow Hierarchy Recovery

- Task name: `#182-#185 UI Pass 7 Triage and Planning workflow hierarchy batch`
- Status: complete with focused browser proof and screenshot evidence

## Original scope

Keep one dominant route-local task on Triage and Planning, stage support summary later, and keep Google Calendar approval wording explicit without changing write behavior.

## Decisions

- Used the same structural fix on both routes: remove the header spotlight summary and move the summary lower than the flagship action surface.
- Deleted Triage's redundant `Current focus` support card instead of restyling it.
- Renamed Planning's Google disclosure to `Google write approval` because the surface is an approval gate, not a generic feature menu.

## What changed

- `apps/web/src/app/triage/page.tsx`
  - Removed the header spotlight summary and the separate `Current focus` card.
  - Added a lower `Queue snapshot` support card after the current item and waiting queue.
- `apps/web/src/app/calendar/page.tsx`
  - Removed the header spotlight summary and added a lower `Planning snapshot` support card.
  - Renamed `Google Calendar options` to `Google write approval`.
  - Tightened the approval copy to `Google write only happens after you approve it.`
- `apps/web/src/__tests__/triage.test.tsx`
  - Updated route assertions to the current-item-first structure.
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - Updated persistence-route expectations so they no longer rely on the removed Triage preamble surface or the old Planning disclosure label.
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - Updated static guard expectations for the new Triage and Planning user-facing contract.
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - Added direct mobile and desktop screenshot proof for Triage and Planning resting hierarchy.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/triage.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
  - passed
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/182-183-triage-decision/2026-06-11-182-183-triage-mobile-rest.png`
- `apps/web/test-results/pass-7/182-183-triage-decision/2026-06-11-182-183-triage-desktop-rest.png`
- `apps/web/test-results/pass-7/184-185-planning-flow/2026-06-11-184-185-planning-mobile-rest.png`
- `apps/web/test-results/pass-7/184-185-planning-flow/2026-06-11-184-185-planning-desktop-rest.png`

Review note:

- Routes and states shown: `/triage` and `/calendar` at rest on mobile and desktop.
- Primary action stays route-local: the current triage decision and the local-first planning flow both land ahead of their support summaries and route details.
- Safety truth stayed visible: Google Calendar still reads as an explicit approval-gated write, not an automatic consequence of planning.
- What moved lower: header summary cards on both routes, plus the redundant Triage preamble card.
- Unchanged: Planning still stays local-first by default, and Google write behavior, OAuth, and persistence rules are unchanged.

## Risks

- Triage and Planning are structurally quieter now, but later visual-system passes could still over-style the lower summary cards back into prominence.
- The Google approval surface is clearer now, but any later copy changes need to preserve the difference between local planning, calendar availability checks, and real Google writes.

## Rollback notes

- Revert the Triage and Planning route hierarchy edits, the Planning approval-label change, the related unit/static/persistence test updates, and the new workflow-hierarchy screenshots together.
