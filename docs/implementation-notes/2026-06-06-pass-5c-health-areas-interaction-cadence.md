# Pass 5C: Health and Areas Interaction Cadence

Date: 2026-06-06

## Scope

Complete Pass 5C of the active UX roadmap by tightening action-near feedback and state-change cadence on:

- `apps/web/src/app/health/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`

Constraints stayed explicit:

- no schema, auth, parser, persistence, or Google write changes
- no shell/layout redesign
- no truth-boundary weakening around saved-versus-local behavior

## What changed

### Health

- Replaced the flat run-status line beside `Run system check` with an authored feedback surface that handles running, success, and failure states.
- Kept the trust answer card as the flagship surface.
- Kept failure guidance plain-language and action-oriented instead of surfacing raw runtime wording.

### Areas

- Added authored create-area progress/success/error feedback inside the flagship create surface.
- Moved accent-update feedback into the accent panel instead of relying on detached route-footer alerts.
- Moved remove-area progress/error feedback into the area actions surface, while keeping successful removal visible after the card disappears.
- Kept local reset confirmation in place and strengthened the success copy so the local-only boundary stays explicit.

## Why this was the right slice

- Health and Areas were the last notable routes still showing older, flatter feedback behavior after Pass 5A and Pass 5B.
- The value was not more redesign. The value was making these routes stop feeling like exceptions to the authored feedback system.
- This closes the interaction-cadence pass cleanly and sets up the next route-identity work on a more stable baseline.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Follow-up

The next honest gap is Pass 6A: stronger route identity on Health and Areas. Interaction cadence is no longer the main problem there.
