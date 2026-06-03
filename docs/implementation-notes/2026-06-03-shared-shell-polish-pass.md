# 2026-06-03 Shared Shell Polish Pass

## Scope

This pass stayed inside the shared presentation layer:

- `apps/web/src/app/globals.css`
- `apps/web/src/app/components/AppShell.tsx`
- `apps/web/src/app/components/WorkflowPageHeader.tsx`
- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/health/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`

No workflow semantics, persistence boundaries, route structure, approval gates, or source-of-truth messaging changed.

## What changed

- Strengthened the shell atmosphere with layered background lighting, calmer chrome, and more intentional header composition.
- Upgraded nav, current-area, time, and quick-note surfaces so the shell reads more like a product frame and less like a utility bar.
- Expanded `WorkflowPageHeader` into a real shared primitive with `eyebrow`, `title`, `description`, `actions`, and `spotlight` composition support.
- Moved Review, Health, and Areas onto the stronger shared header composition while preserving their existing route contracts.
- Added lighter interaction polish through shared transitions, stronger spotlight/header surfaces, and a quieter `System details` disclosure treatment.

## Why this pass

The previous modernization work had already fixed hierarchy, truthfulness, and route clarity. The main remaining gap was that the product still looked a bit too assembled from utilities instead of feeling like one composed system. The highest-leverage next move was shared shell polish, not another route-by-route rewrite.

## Validation

Passed:

- `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/routeSmoke.test.tsx src/__tests__/page.test.tsx src/__tests__/healthPage.test.tsx src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm type-check`

Validation note:

- `pnpm type-check` initially hit the known transient `.next/types` generation race in this repo, then passed immediately when rerun after `pnpm build`. No app-code fix was required because the failure was generated-file timing, not a TypeScript regression.
