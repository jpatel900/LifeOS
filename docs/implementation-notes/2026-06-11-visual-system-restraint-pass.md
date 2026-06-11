Task name: Pass 7 visual-system restraint batch for issues `#190` through `#193`
Branch: main

## Original scope

Complete the final visual-system cleanup after route hierarchy recovery:

- reduce nested card depth and surface variants
- tighten typography, spacing, density, and dark-mode readability
- restrain borders, gradients, shadows, and accent use
- normalize mobile tap targets and shell control density

## Assumptions

- The primary hierarchy problems were already solved in earlier Pass 7 route work.
- The remaining problem was shared visual noise in the token and surface layer, not missing product behavior.
- Safety, parser, auth, persistence, and Google approval rules had to remain untouched.

## Decisions

- The batch was solved mostly in shared primitives and `globals.css` instead of route-by-route restyling.
- Flagship cards stayed distinct, but support, admin, shell, and nested panel surfaces were flattened enough to stop reading as stacked boxes.
- Dark-mode readability was improved by slightly tightening muted and border contrast rather than changing the route palette direction.
- Mobile comfort was enforced in the shell by raising nav, area, quick-note, and status controls to a `40px` target floor.

## Deviations

- No new route-specific hierarchy changes were introduced. The earlier Pass 7 ordering contracts stayed intact.
- Existing browser accent proof was extended instead of creating a second overlapping visual-system browser suite.

## Tradeoffs

- Shared cards still keep some authored depth and accent framing. The goal was restraint, not flattening LifeOS into generic SaaS chrome.
- The mobile target rule is enforced in shell controls directly; later accessibility work still needs to review route-local buttons and disclosures.

## Files changed and why

- `apps/web/src/app/globals.css`
  - reduced shared shadow depth, softened gradients, tightened header spacing and type rhythm, improved dark-mode border and muted contrast, and flattened nested support surfaces
- `apps/web/src/app/components/AppShell.tsx`
  - normalized mobile shell control sizes and reduced shell control visual weight
- `apps/web/src/components/ui/button.tsx`
  - removed default button shadow weight and raised the small button size to a touch-friendly floor
- `apps/web/src/components/ui/card.tsx`
  - removed the base card shadow so shared workflow surface classes own authored depth deliberately
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/textarea.tsx`
  - removed default control shadows so route-level density is calmer by default
- `apps/web/src/__tests__/appShellAccent.test.tsx`
  - added a shell-level regression for touch-friendly control sizing
- `apps/web/tests/e2e/workflow-card-accent.spec.ts`
  - extended browser proof with desktop and mobile screenshot evidence plus a direct mobile target-height check
- `docs/PROJECT_STATE.md`
  - recorded shipped visual-system truth and moved the next recommendation to the accessibility and evidence phase
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - updated the route scorecard remaining-gap language and linked this proof note
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - queued issue comments for `#190` through `#193`

## Validation commands and results

- Focused unit proof:
  - `pnpm --filter @lifeos/web test -- src/__tests__/appShellAccent.test.tsx src/__tests__/routeSmoke.test.tsx`
  - passed
- Focused browser proof:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts`
  - passed
  - screenshot evidence written under:
    - `apps/web/test-results/pass-7/190-card-depth-restraint`
    - `apps/web/test-results/pass-7/191-type-density`
    - `apps/web/test-results/pass-7/192-visual-restraint`
    - `apps/web/test-results/pass-7/193-mobile-targets`
- Required browser regression proof:
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
  - passed after updating the Health browser smoke to the shipped calm-first-load contract
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/interaction-feedback.spec.ts`
  - passed after removing stale Triage wording assumptions
  - `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
  - passed
- Full repo gate:
  - `git diff --check`
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm test`
  - `pnpm build`
  - all passed

## Risks

- Shared visual restraint now depends more heavily on `globals.css`. Route-local raw utility styling can still reintroduce noise if later work ignores the shared surface classes.
- Raising touch targets in the shell slightly increases chrome footprint, so later accessibility work should resist adding more shell controls without removing something else.

## Deferred items

- Pass 7 accessibility, motion, performance, and evidence work (`#194` through `#197`)
- Pass 7 final audit and closeout (`#198` and `#199`)
- GitHub CLI auth and remaining label or milestone backfill still need separate resolution

## Rollback notes

- Revert the shared visual-layer files, shell control sizing changes, the paired shell/browser tests, and the docs updates together.
- Do not roll back only the primitive-layer shadow and height changes without also rechecking the Playwright target-size proof and the current route screenshots.
