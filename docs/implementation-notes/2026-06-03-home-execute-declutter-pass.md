# 2026-06-03 Home and Execute Declutter Pass

## Scope

This pass stayed inside the existing Home and Execute surfaces plus the focused tests they touch:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/execute/page.tsx`
- `apps/web/src/app/components/AppShell.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`

No route semantics, persistence boundaries, approval gates, auth behavior, or calendar-write rules changed.

## What changed

- Home now defaults to one supporting card instead of letting multiple secondary surfaces compete with the main `Today / Next` card.
- Secondary Home context now sits behind a single disclosure, but quick capture stays pinned while the user is actively typing or while save feedback is visible so the card does not jump away mid-flow.
- Execute now keeps the current mission visually dominant and moves lower-priority mission metadata behind a `Mission details` disclosure.
- Execute focus-state truth and save-mode details now live behind one `System details` disclosure instead of competing inline panels.
- Recent execution summary is now collapsed by default into a disclosure instead of reading like another first-class card.
- Persisted-session stop guidance remains explicit and visible, but no longer relies on duplicated copy.

## Why this pass

The previous modernization work improved hierarchy and aesthetics, but the screens were still too willing to show multiple equally weighted support surfaces at once. The real next move was subtraction. The goal here was to preserve truthfulness while making the default reading path feel calmer and more decisive.

## Validation

Passed:

- `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm type-check`

Browser spot-check note:

- A local Browser-plugin inspection of `/` and `/execute` on `http://127.0.0.1:3001` matched the calmer composition, but it ran in degraded/mock conditions because the local dev server had no authenticated persisted session. Treat that as a visual sanity check, not authenticated production-state proof.
