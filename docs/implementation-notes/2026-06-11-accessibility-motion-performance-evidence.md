Task name: Pass 7 accessibility, motion, performance, and evidence batch for issues `#194` through `#197`
Branch: main

## Original scope

Complete the last shared hardening pass before the final audit:

- accessibility baseline for contrast, focus, target size, keyboard reachability, and status semantics
- reduced-motion and motion-restraint proof
- perceived-speed and layout-stability proof
- standardized screenshot evidence packet format

## Assumptions

- The main route hierarchy and shared visual restraint work were already finished.
- Remaining gaps were largely proof, semantics, and small shared-surface hardening rather than new route behavior.
- No schema, auth, calendar-write, parser, or persistence behavior was allowed to move.

## Decisions

- Accessibility work focused on real baseline gaps: polite live regions for non-destructive feedback, explicit focus proof, and readable dark-mode contrast checks.
- Reduced-motion proof targeted meaningful motion surfaces instead of decorative churn: celebratory feedback, interactive transitions, and the running focus orb.
- Performance proof focused on warmed-route usability and layout stability instead of fragile absolute timing across cold dev compiles.
- The screenshot packet format was added to the existing screenshot workflow doc instead of creating a second competing proof guide.

## Deviations

- Browser tests had to be updated to the shipped Pass 7 route contract while the gate was running. The failures were stale assumptions, not route regressions.

## Files changed and why

- `apps/web/src/app/components/AppShell.tsx`
  - quick-note success feedback now announces through a polite status region
- `apps/web/src/app/components/WorkflowLoadingState.tsx`
  - loading surfaces now expose polite status semantics
- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/execute/page.tsx`
- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
  - non-destructive route feedback now uses explicit polite live-region semantics consistently
- `apps/web/src/app/globals.css`
  - reduced-motion mode now also disables focus-orb transitions explicitly
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - added a static guard for polite status semantics on non-destructive workflow feedback
- `apps/web/tests/e2e/accessibility-baseline.spec.ts`
  - added browser proof for dark-mode contrast, visible focus, and status semantics
- `apps/web/tests/e2e/motion-performance.spec.ts`
  - added reduced-motion proof plus warmed-route capture stability proof
- `apps/web/tests/e2e/interaction-feedback.spec.ts`
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
  - updated stale route assumptions uncovered during the broader browser gate
- `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`
  - extended the workflow into the final packet format and added the current Pass 7 packet index

## Validation commands and results

- Focused static and unit proof:
  - `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/appShellAccent.test.tsx`
  - passed
- Focused browser proof:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/accessibility-baseline.spec.ts`
  - passed
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/motion-performance.spec.ts`
  - passed
- Required broader browser proof rechecked after the semantic updates:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/interaction-feedback.spec.ts`
  - passed
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
  - passed
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
  - passed

## Risks

- The contrast proof uses representative authored surfaces, not every text node in the app. Later route-local color experiments can still regress readability if they bypass the shared surface system.
- The warmed-route performance check is intentionally about perceived readiness and stability, not cold-compile dev-server timing.

## Deferred items

- Final audit and closeout (`#198` and `#199`)
- GitHub CLI auth and remaining label or milestone backfill still need separate resolution

## Rollback notes

- Revert the shared live-region semantics, reduced-motion change, static guard, new browser specs, and screenshot-workflow packet section together.
- If only the proof docs are reverted, re-run the final audit prep first so the repo does not keep claiming a packet format it no longer defines.
