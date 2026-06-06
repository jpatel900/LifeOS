# 2026-06-06 Pass 4A Execute Review Shell Quieting

## Scope

Implement the first shell-quieting slice from roadmap Pass 4:

- reduce shell burden on `/execute` and `/review`
- keep route-local flagship action ahead of chrome
- preserve keyboard reachability and route truthfulness

This was not a route-logic or primitive-expansion pass.

## What changed

- `apps/web/src/app/components/AppShell.tsx`
  - suppresses the extra shell-context band on `/execute` and `/review`
  - applies a quieter shell-header treatment on those two routes
- `apps/web/src/app/globals.css`
  - adds route-quiet shell modifiers
  - adds a quieter support-card modifier for support surfaces that should step back
- `apps/web/src/app/execute/page.tsx`
  - demotes the two main support cards without changing the flagship mission card or route semantics
- `apps/web/src/app/review/page.tsx`
  - demotes the main support surfaces so closure-first action wins the first scan faster
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - now proves the shell-context band is absent on `/execute` and `/review`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - now checks the shell-context band is absent in real browser proof on `/execute` and `/review`

## Why

Pass 3 reduced wording. The next real drag on these routes was not copy. It was shell/support competition:

- the extra shell-context band still sat above the route-local flagship surface
- support cards on Execute and Review still carried too much visual weight once the copy budget was already under control

The right fix was subtraction and demotion, not more components.

## Result

Execute and Review now open under quieter shell framing:

- route-local flagship cards win the first scan faster
- the shell still keeps navigation, current area, and quick note behavior intact
- keyboard paths and truth boundaries stay unchanged

## Validation

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Notes

- This is a shell pass, not a new route taxonomy pass.
- The shared primitive/disclosure layer was reused as-is; no new shadcn-style primitives were added.
- The next honest extension of Pass 4 is Capture and Planning, not another round of shell changes on Execute and Review.
