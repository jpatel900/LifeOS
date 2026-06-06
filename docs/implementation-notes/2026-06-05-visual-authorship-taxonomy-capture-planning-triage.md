# 2026-06-05 Visual Authorship Taxonomy: Capture, Planning, Triage

## Intent

Finish roadmap Pass 2 by extending the explicit authored surface taxonomy to the remaining primary workflow routes:

- `/capture`
- `/calendar`
- `/triage`

Out of scope:

- schema changes
- auth changes
- parser contract changes
- persistence-contract changes
- Google Calendar approval/write behavior changes

Skills used:

- `impeccable`
  - bounded to product/layout/polish guidance only
- repo-local testing and handoff discipline

## What changed

### Capture

- Promoted `capture-main-card` into the flagship writing surface.
- Wrapped the header metrics in a shared support card instead of leaving them as free-floating equal-weight summary tiles.
- Demoted device-only helper/history flows into quieter admin treatment so saved/raw capture remains the obvious center of gravity.

### Planning

- Promoted `planning-flow-card` into the route flagship instead of letting `Needs a suggested time` compete with it.
- Demoted task/proposal/block sections into support cards so `Planning flow` remains the first clear visual answer to “what do I do next?”
- Demoted Google/admin overflow surfaces into quieter admin treatment without changing approval gates or local-first truth.

### Triage

- Promoted `triage-current-item-card` into the clear flagship surface.
- Wrapped the header metrics in a shared support card and kept `Current focus` / `Waiting after this` in the support layer.
- Demoted edit/context/browser-note surfaces into quieter admin treatment so they stop competing with the decision itself.

### Proof updates

- Updated focused route tests to assert the new flagship/support/admin contract.
- Updated `apps/web/tests/e2e/workflow-hierarchy.spec.ts` so browser proof matches the intended Planning contract: `Planning flow` is now the flagship and `Needs a suggested time` is support.

## Files changed

- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/__tests__/capture.test.tsx`
- `apps/web/src/__tests__/triage.test.tsx`
- `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- `docs/PROJECT_STATE.md`

## Proof

Focused proof:

- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/triage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`

Browser proof:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/execute-focus-flagship.spec.ts`

Standard repo bar:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm type-check`
  - first run hit the known transient `.next/types` generation race
  - reran after build and passed

## Residual risks

- Capture, Planning, and Triage still carry too much explanatory copy once their disclosures are expanded.
- Pass 2 is now materially complete, but Pass 3 should trim copy carefully so truthfulness does not regress into vagueness.

## Next recommended pass

Pass 3A: remove explanation-by-default from Capture, Planning, and Triage now that their flagship/support/admin hierarchy is stable.
