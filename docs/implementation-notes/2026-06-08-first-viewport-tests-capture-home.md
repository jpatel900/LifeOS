# First Viewport Tests For Capture And Home

- Task name: `#160 UI Pass 7 07 Add first viewport tests for Capture and Home`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add first-viewport tests for Capture and Home so the primary task and primary action stay ahead of support and diagnostic surfaces on mobile.

## Assumptions

- A truthful first-viewport test is only useful if the route hierarchy actually matches the intended contract.
- Capture's shell quick-note composer was redundant on `/capture` because the route already exists to perform the same raw-input job.

## Decisions

- Added explicit `390px` browser tests for Home and Capture in `workflow-hierarchy.spec.ts`.
- Kept the Home test focused on the dominant next-action surface rather than incidental copy blocks.
- Simplified `/capture` so the route-local raw-entry card owns the first viewport and moved the support summary below that card.
- Suppressed the shell quick-note composer on `/capture` only. The shell composer still exists on other eligible routes.
- Treated `Save thought` as the primary first-viewport action on Capture. `Save and organize` remains visible and available, but the test does not require both actions to fit fully above the fold.

## Deviations

- This issue needed a narrow runtime fix on Capture, not just a test addition. The existing mobile hierarchy would have made the first-viewport proof dishonest.
- I did not broaden into later shell or Capture simplification issues. The change here is the minimum structural adjustment required to make `#160` truthful and durable.

## Tradeoffs

- Suppressing the shell quick-note composer on `/capture` removes one redundant capture entry point, which improves focus but slightly reduces cross-route consistency in the shell.
- The first-viewport tests now protect hierarchy and staging without forcing secondary actions to remain above the fold on small screens.

## Files changed and why

- `apps/web/src/app/capture/page.tsx`
  - Removed the generic page header usage, folded the route identity into the main flagship card, moved the support summary below the primary card, and tightened the card layout so raw input and `Save thought` lead the mobile viewport.
- `apps/web/src/app/components/AppShell.tsx`
  - Suppressed the shell quick-note composer on `/capture` so the shell does not compete with the route's own capture workflow.
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - Added first-viewport coverage for Home and Capture and aligned the Capture assertions to the real primary-action contract.
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
  - Moved shell quick-note behavioral proof to `/triage` and updated keyboard coverage so it no longer expects shell quick-note controls on `/capture`.
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Updated smoke proof for the new `/capture` shell behavior and relocated shell quick-note feedback coverage to `/triage`.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#160`.
- `docs/PROJECT_STATE.md`
  - Recorded the shipped first-viewport proof and the `/capture` shell quick-note suppression truth.
- `docs/implementation-notes/2026-06-08-first-viewport-tests-capture-home.md`
  - Captured the scope, decisions, proof, and rollback notes for this batch.

## Validation commands and results

- `pnpm install --frozen-lockfile`
  - passed
- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/page.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts tests/e2e/p0-ux-regression.spec.ts`
  - passed
- `git diff --check`
  - passed with LF to CRLF normalization warnings only
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- Capture's support summary card is now later in the mobile flow, so any future work that depends on top-of-page support metrics must not quietly re-promote it above the raw-entry surface.
- Other routes may still have separate first-viewport clutter problems that `#160` does not address.

## Deferred items

- Continue into `#161` degraded-state severity tests only after the final `#160` validation gate passes.
- Later shell, Capture, and visual-system issues may further refine the route, but they should not reintroduce shell-local competition above the raw-entry workflow.

## Rollback notes

- Revert the Capture route layout change, the `/capture` shell quick-note suppression, the updated tests, the GitHub draft block, and this note together.
- Do not keep the new first-viewport tests if the route hierarchy is rolled back; they are intentionally coupled to the shipped structure.
