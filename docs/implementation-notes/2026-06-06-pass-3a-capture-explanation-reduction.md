# 2026-06-06 Pass 3A Capture Explanation Reduction

## Scope

Land the first runtime slice of roadmap Pass 3A by reducing explanation-by-default on `/capture`.

This stayed inside:

- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/__tests__/capture.test.tsx`
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
- `apps/web/tests/e2e/workflow-card-accent.spec.ts`

No schema, persistence, auth, parser contract, route structure, or Google Calendar behavior changed.

## What changed

- Shortened the route-level editorial description from a two-step explainer to `Write first. Decide what it is second.`
- Compressed the spotlight metric helper copy so save-mode and area guidance stop repeating the same truth already visible elsewhere
- Shortened the field, area, and action-tray helper copy around the main capture form
- Renamed `On-device draft pass` to `Local draft pass`
- Shortened the save-path button helper text
- Removed redundant intro copy above the saved-history and device-only-history sections while keeping the same headings and truth model

## Why

Capture already had the right hierarchy and the right safety model.

The remaining problem was repetition:

- header copy
- spotlight helper copy
- action-tray helper copy
- disclosure copy
- history intro copy

All of them were telling overlapping versions of the same save/local/sort story.

This slice reduces reading load without weakening any truth boundary.

## What stayed intentionally unchanged

- `Save thought` vs `Save and organize` semantics
- parser-status labels and parser-status detail
- save-mode disclosure and technical save-mode id
- local draft flow versus saved-history separation
- shared primitive/disclosure layer

This was copy/disclosure compression, not a workflow rewrite.

## Validation

- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
  - needed one rerun after the known intermittent `.next/types` generation race
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Remaining Pass 3A work

- `/calendar`
- `/triage`

Those are the next slices because they still carry more repeated helper/disclosure explanation than Capture now does.
