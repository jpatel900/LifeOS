# 2026-06-06 Pass 4B Capture and Planning shell quieting

## Scope

Completed Pass 4B of the active UX roadmap by extending the shell-quieting program from Execute/Review into Capture/Planning only. This stayed route-level and visual only: no parser, persistence, auth, schema, or Google Calendar behavior changed.

## What changed

- `apps/web/src/app/components/AppShell.tsx`
  - Added `/capture` and `/calendar` to the quiet-shell route set so the extra shell-context band is suppressed there just like `/execute` and `/review`.
- `apps/web/src/app/capture/page.tsx`
  - Demoted the header summary spotlight with `workflow-quiet-card` so the `Write it down` flagship card wins the first scan faster.
- `apps/web/src/app/calendar/page.tsx`
  - Demoted the header summary spotlight with `workflow-quiet-card` so the `Planning flow` flagship card wins the first scan faster.
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Updated route-smoke expectations so Capture and Planning now assert the shell-context band is absent.
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - Added the same browser-level shell-context assertions for Capture and Planning.

## Why this is the right slice

The routes already had the correct flagship surfaces. The actual inconsistency was that the shell was still consuming attention above those surfaces on Capture and Planning. Suppressing that band and demoting the top summary cards fixes the problem without reopening route structure or inventing new components.

## Validation

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Outcome

Pass 4 is now complete. The next honest UX implementation stream is Pass 5: tighten interaction feel and closure cadence rather than doing more blanket shell reduction.
