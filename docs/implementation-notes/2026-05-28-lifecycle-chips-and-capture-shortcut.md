# 2026-05-28 lifecycle chips and capture shortcut

## Scope

Resolve issue `#91` and the first safe slice of issue `#92` without broadening into a command palette or app-wide shortcut framework.

## What changed

- Added `apps/web/src/lib/workflowLifecycle.ts` as the shared UI vocabulary for capture, triage, planning, execute, and review lifecycle chips.
- Updated `/capture`, `/triage`, `/calendar`, `/execute`, and `/review` to use the shared lifecycle chip labels instead of route-specific wording.
- Added a visible `Ctrl/Cmd + Enter` affordance to the main Capture textarea and wired that shortcut to the existing `Save thought` path only.
- Tightened the persisted Review regression so it waits for the async provider swap before asserting that local browser capture state is excluded from Supabase-backed review summaries.

## Constraints kept

- No schema, migration, RLS, auth, parser, observability, or Google Calendar write behavior changed.
- No app-wide command palette, command router, or shortcut registry was introduced.
- No new persistence contract or provider behavior was added.

## Validation

- `pnpm --filter @lifeos/web test -- capture.test.tsx triage.test.tsx phase4aPersistence.test.tsx sourceOfTruth.test.ts routeSmoke.test.tsx`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`
