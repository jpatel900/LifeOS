# 2026-06-06 Shadcn Consistency Plan Completion

## Scope

Close the remaining route-level seams in the current frontend consistency plan:

- standardize repeated system-details disclosures
- standardize repeated primitive label usage
- standardize repeated loading-state scaffolding
- keep route composition, shell identity, and area accents custom

This was not a generic redesign pass.

## What changed

- Finished routing repeated disclosure blocks through `DiagnosticsDisclosure` on:
  - `apps/web/src/app/calendar/page.tsx`
  - `apps/web/src/app/triage/page.tsx`
  - `apps/web/src/app/review/page.tsx`
- Finished routing the Health loading surface through `WorkflowLoadingState` in:
  - `apps/web/src/app/health/page.tsx`
- Replaced the remaining repeated route-level checkbox/label seam in:
  - `apps/web/src/app/calendar/page.tsx`
- Confirmed the only remaining raw `details/summary` and base `<label>` markup lives in the shared abstraction layer itself:
  - `apps/web/src/app/components/DiagnosticsDisclosure.tsx`
  - `apps/web/src/components/ui/label.tsx`

## Result

The current route-level shadcn-consistency plan is complete.

Shared primitives and common interaction patterns now cover the repeated seams they were supposed to cover:

- `Label`
- `Skeleton`
- `WorkflowLoadingState`
- `DiagnosticsDisclosure`

Primary workflow and settings routes should extend these abstractions, not reintroduce hand-written equivalents, unless a route has a clearly different requirement.

## What stayed intentionally custom

- `AppShell`
- `WorkflowPageHeader`
- flagship/support/admin composition
- area accent treatment
- route-specific editorial framing

That is product authorship, not primitive inconsistency.

## Validation

- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Notes

- The repo still has the known intermittent `.next/types` race in some flows; this run passed with the normal build-first validation path.
- Future frontend work should treat this as a maintenance rule, not an excuse to maximize shadcn surface area.
