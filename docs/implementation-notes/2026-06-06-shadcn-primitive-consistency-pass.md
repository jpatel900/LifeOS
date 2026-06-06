# 2026-06-06 Shadcn Primitive Consistency Pass

## Scope

Implement the first real frontend slice of the new repo rule:

- push shared primitives and repeated interaction patterns toward app-local shadcn-compatible components
- keep shell identity, route authorship, area accents, and flagship/support/admin composition custom

This was intentionally not a full frontend rewrite.

## Changes

- Added app-local `Label` primitive in `apps/web/src/components/ui/label.tsx`
- Added app-local `Skeleton` primitive in `apps/web/src/components/ui/skeleton.tsx`
- Updated `WorkflowLoadingState` to use `Skeleton`
- Upgraded `DiagnosticsDisclosure` so routes can reuse one standard `details/summary` wrapper with custom content and summary classes
- Replaced repeated raw label/disclosure markup in:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/capture/page.tsx`
  - `apps/web/src/app/execute/page.tsx`
  - `apps/web/src/app/review/page.tsx`
  - `apps/web/src/app/settings/areas/page.tsx`
  - `apps/web/src/app/settings/areas/GoogleCalendarConnectionPanel.tsx`
  - `apps/web/src/app/triage/page.tsx`
- Rebuilt `apps/web/src/app/login/page.tsx` onto the same card/form vocabulary instead of raw inline-styled markup

## Why

The repo already had a partial shadcn-style primitive layer, but it still leaked repeated route-local label markup, bespoke skeleton markup, and many hand-written `details/summary` blocks.

This pass standardizes those repeated seams without flattening the authored route system into generic kit UI.

## What stayed intentionally custom

- `AppShell`
- `WorkflowPageHeader`
- area accent treatment
- flagship/support/admin surface taxonomy
- route-level editorial composition

Those are product language, not primitive drift.

## Validation

- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
  - needed one rerun after build because this repo still intermittently hits the known `.next/types` generation race
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Notes

- This pass is a foundation slice, not completion of the whole frontend consistency program.
- Future work should keep extending primitives and shared patterns where repetition is real, not blindly maximize shadcn surface area.
