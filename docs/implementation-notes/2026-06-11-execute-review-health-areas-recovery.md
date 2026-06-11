Task name: Pass 7 workflow-route recovery batch for Execute, Review, Health, and Areas
Branch: main

## Original scope

Complete issues `#186` through `#189` without broad route rewrites:

- Execute: one mission, one visible state, one next move
- Review: carry-forward decisions before metrics and history
- Health: explicit diagnostic home
- Areas: quiet admin registry

## Assumptions

- Existing route identity work from earlier passes was directionally correct.
- The remaining gap was hierarchy and diagnostic staging, not new product behavior.
- Safety boundaries around persistence, parser truth, auth, and calendar approval had to remain unchanged.

## Decisions

- Execute kept the flagship mission card intact and demoted the surrounding support surfaces instead of redesigning the route.
- Review moved the carry-forward board and saved-history surfaces behind one lower disclosure so the closure path stays visible first.
- Health stopped showing celebratory run feedback on initial load; only manual re-runs now surface that feedback prominently.
- Areas dropped the extra header summary card and kept the create-area action as the first admin surface.

## Deviations

- Health required one extra behavioral correction beyond copy and hierarchy: the initial success alert had to be removed because it pushed the flagship trust answer below the first mobile viewport.

## Tradeoffs

- Review still keeps the carry-forward board in the DOM for proof and accent coverage, but it is intentionally hidden behind disclosure at rest.
- Areas still exposes registry, calendar-admin, and reset disclosures on the page because those are real admin tasks, but they now sit lower and compete less with creation.

## Files changed and why

- `apps/web/src/app/execute/page.tsx`
  - demoted duplicated state chatter, renamed support surfaces, removed the redundant top-of-route mission record disclosure, and made the right column a real next-move lane
- `apps/web/src/app/review/page.tsx`
  - moved the carry-forward board and saved-history region behind `Review details and history`, and renamed the lighter save-truth disclosure
- `apps/web/src/app/health/page.tsx`
  - made Health’s diagnostic-home role more explicit and suppressed success feedback on initial load
- `apps/web/src/app/settings/areas/page.tsx`
  - removed the header summary spotlight, moved registry details below the flagship create card, and further demoted admin actions
- `apps/web/src/__tests__/executeFocusPolish.test.tsx`
  - updated Execute assertions for the new support-surface naming
- `apps/web/src/__tests__/healthPage.test.tsx`
  - split quiet first-load behavior from loud manual re-run feedback
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - made Execute terminal-state assertions tolerant of intentionally duplicated next-step text
- `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
  - removed the stale Areas header-summary expectation
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - added mobile and desktop hierarchy proof plus screenshots for Execute, Review, Health, and Areas
- `docs/PROJECT_STATE.md`
  - recorded shipped truth and next recommended work
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - updated route scorecard expectations and proof references
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - queued GitHub comments for `#186` through `#189`

## Validation commands and results

- Focused unit and route tests:
  - `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/workflowAreaAccent.test.tsx`
  - passed
- Focused browser proof:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
  - passed
  - screenshot evidence written under:
    - `apps/web/test-results/pass-7/186-execute-mission`
    - `apps/web/test-results/pass-7/187-review-carry-forward`
    - `apps/web/test-results/pass-7/188-health-diagnostic-home`
    - `apps/web/test-results/pass-7/189-areas-admin-registry`
- Regression browser proof:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
  - passed

## Risks

- Review’s lower disclosure now carries more of the route’s historical density. If a future pass reopens it by default, the route will regress quickly.
- Execute now relies more on the right-column next-move card to keep support honest. Future additions there must stay subordinate to the mission card.
- Health still has enough density that later visual-system work must reduce noise without flattening the diagnostic truth.

## Deferred items

- Pass 7 visual-system cleanup (`#190` through `#193`)
- Pass 7 accessibility, motion, performance, evidence, and final audit work (`#194` through `#199`)
- GitHub CLI auth and remaining label or milestone backfill still need separate resolution

## Rollback notes

- Revert the four route files plus their directly paired tests and `workflow-hierarchy.spec.ts` together.
- If only one route needs rollback, separate that route’s docs update from the shared batch note first so `PROJECT_STATE` and the roadmap do not overstate shipped hierarchy.
