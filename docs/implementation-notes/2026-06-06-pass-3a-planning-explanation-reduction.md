# 2026-06-06 Pass 3A Planning Explanation Reduction

## Scope

Land the second runtime slice of roadmap Pass 3A by reducing explanation-by-default on `/calendar`.

This stayed inside:

- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- `apps/web/tests/e2e/interaction-feedback.spec.ts`

No proposal semantics, persistence flow, Google approval gate, auth behavior, or route structure changed.

## What changed

- Shortened the route-level editorial description
- Compressed the flagship `Planning flow` helper paragraph
- Shortened support-card descriptions for:
  - `Already planned`
  - `Needs a suggested time`
  - `Ready to review`
- Shortened the empty-state paragraph when nothing needs time yet
- Shortened the adjust-time helper copy
- Compressed the footer safety and next-step wording

## Why

Planning still repeated the same truth too many times:

- start local
- Google writes are explicit
- free/busy is advisory
- planned blocks belong in Execute next

Those rules are important, but the route was spending too many words repeating them across the header, flagship card, support cards, and footer.

This slice keeps the same truth model while reducing reading load.

## What stayed intentionally unchanged

- `Planning flow`
- `Needs a suggested time`
- `Ready to review`
- `Already planned`
- `Planning details`
- `Google Calendar options`
- `Nothing goes to Google Calendar until you approve it.`
- proposal adjustment actions
- conflict-check and Google-write gating

This was explanation reduction, not planning-behavior redesign.

## Validation

- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`

## Remaining Pass 3A work

- `/triage`

That is now the only remaining route-level explanation-by-default slice in the current roadmap pass.
