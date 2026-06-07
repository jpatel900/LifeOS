# Home Cockpit Flagship Taxonomy Maintenance

Date: 2026-06-06

## Scope

Close the last meaningful Home-only authored-surface gap inside the already-shipped UX system:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/__tests__/page.test.tsx`
- `apps/web/src/__tests__/workflowAreaAccent.test.tsx`

Constraints stayed explicit:

- no Home behavior changes
- no Next-action ranking changes
- no write-path additions
- no shell redesign
- no roadmap reopening disguised as a new pass

## What changed

- Gave the `Today next` surface an explicit Home-only flagship treatment so the route opens with a clearer instrument-panel center of gravity.
- Split Home support cards into two intentional tiers:
  - one featured support surface
  - quieter overflow support surfaces behind disclosure
- Added stable test hooks for the main support-card taxonomy so hierarchy drift can be caught without brittle copy matching.

## Why this was the right slice

- The roadmap was already functionally complete. Pretending there was a hidden Pass 6C would have been fake process.
- Home was the only route scorecard row still implying a meaningful hierarchy gap.
- The remaining value was not more interaction mechanics. It was making the authored flagship/support split explicit enough that future changes do not drift back into equal-weight support noise.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`

## Follow-up

Treat Home authored-surface hierarchy as maintenance now. Reopen it only if browser proof shows hierarchy drift or a new Home requirement forces a real contract change.
