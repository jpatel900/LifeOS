# 2026-06-05 Visual Authorship Taxonomy: Review, Health, Areas

## Intent

Continue active roadmap Pass 2 by extending the explicit authored surface taxonomy beyond Home and Execute.

Routes in scope:

- `/review`
- `/health`
- `/settings/areas`

Out of scope:

- schema or persistence changes
- auth changes
- parser changes
- Google Calendar write changes
- shell information architecture changes outside touched routes

Skills used:

- `impeccable`
  - bounded to product/layout/polish guidance only
- repo-local testing and handoff discipline

## What changed

### Review

- Promoted `review-next-decision-card` to a true flagship surface with the shared `workflow-flagship-card` treatment.
- Demoted `review-close-loop-card` and `review-today-at-a-glance-card` into the shared support-card layer.
- Moved reflection/history disclosure surfaces onto the shared admin-card treatment so lower-page detail feels intentionally secondary instead of visually equal.

### Health

- Promoted `health-reliability-card` to the same flagship treatment used on other top-priority routes.
- Converted trust-summary and attention surfaces to the shared support-card layer so diagnostics do not compete with the top reliability answer.
- Moved subsystem diagnostic cards under `Health details` into the shared admin-card treatment.

### Areas

- Promoted `areas-create-card` into the route flagship surface.
- Wrapped the header summary in a shared support card so the route header composition is no longer ad hoc.
- Shifted per-area cards into the support-card layer and moved area actions, accent editing, diagnostics, and local reset into the admin-card layer.

## Files changed

- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/health/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
- `apps/web/src/__tests__/healthPage.test.tsx`
- `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- `docs/PROJECT_STATE.md`

## Proof

Focused proof:

- `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx`

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

- Capture, Planning, and Triage still use more route-local hierarchy choices than the newer flagship/support/admin contract.
- Review and Areas still expose more below-the-fold disclosure copy than a true Pass 3 copy-budget pass should allow.

## Next recommended pass

Pass 2C: finish the same explicit surface-taxonomy spread on Capture, Planning, and Triage before starting explanation-reduction work.
