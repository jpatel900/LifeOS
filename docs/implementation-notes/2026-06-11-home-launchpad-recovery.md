# Home Launchpad Recovery

- Task name: `#178-#181 UI Pass 7 Home launchpad and degraded-state batch`
- Status: complete with focused browser proof and screenshot evidence

## Original scope

Keep Home calm, read-only, and action-forward while reducing support-card clutter and keeping degraded account-data states accurate but non-shaming.

## Decisions

- Removed the separate `Daily loop` empty-state card instead of restyling it. It was redundant with the flagship `Today / Next` launchpad and made the route feel more dashboard-like than it needed to.
- Kept the read-only rule visible, but moved it into a quieter note inside the flagship card.
- Tightened degraded copy without changing behavior: local workflow still works when account data fails partially, and Health remains the diagnostic home.

## What changed

- `apps/web/src/app/page.tsx`
  - Changed degraded-state wording from `Account data is partially unavailable` to the calmer `Some account data did not load`.
  - Moved the read-only daily-loop guidance into a small `home-read-only-note` inside the flagship card.
  - Removed the separate `Daily loop` support card.
  - Shortened the flagship disclosure label from `Suggested follow-through` to `After this`.
- `apps/web/src/__tests__/page.test.tsx`
  - Updated Home assertions to match the quieter launchpad structure and calmer degraded copy.
  - Kept proof that Home stays read-only and that details still land after the primary action.
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
  - Updated the Home browser regression to prove the route stays read-only without the old `Daily loop` surface.
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - Added mobile and desktop screenshot evidence for the quieter Home resting state.
  - Kept first-viewport proof that the flagship next action stays ahead of `Today details`.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/178-181-home-launchpad/2026-06-11-178-181-home-mobile-rest.png`
- `apps/web/test-results/pass-7/178-181-home-launchpad/2026-06-11-178-181-home-desktop-rest.png`

Review note:

- Route and state shown: `/` at rest on mobile and desktop.
- Primary action stays route-local: the `Capture a thought` CTA remains the dominant launch move.
- Safety truth stayed visible: Home still says it is read-only, and degraded account-data states still route users toward Health without pretending nothing happened.
- What moved out: the separate `Daily loop` support card no longer competes with the launchpad.
- Unchanged: Home still does not mutate workflow state directly.

## Risks

- Home is quieter now, but later workflow-route passes could still reintroduce support-card sprawl if they promote every queue summary back onto the route.
- The flagship disclosure is shorter, but it still carries support guidance. If later audits show the card is still wordy, trim that disclosure before adding any new support surface.

## Rollback notes

- Revert the Home degraded-copy update, the flagship read-only note, the `Daily loop` card removal, and the matching unit plus Playwright updates together.
