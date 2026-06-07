# Pass 6B: Execute and Review Route Identity

Date: 2026-06-06

## Scope

Complete Pass 6B of the active UX roadmap by strengthening route identity on:

- `apps/web/src/app/execute/page.tsx`
- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/globals.css`

Constraints stayed explicit:

- no schema, auth, parser, persistence, or Google write changes
- no shell redesign
- no truth-boundary weakening around saved-versus-local behavior

## What changed

### Execute

- Reframed the route opening around a mission room instead of a generic task screen.
- Strengthened the flagship mission card and the secondary mission-state / lane-protection surfaces so the route reads like one focused execution scene.
- Kept the same quiet shell contract and the same authored start/pause/end feedback from earlier passes.

### Review

- Reframed the route header and flagship around a carry-forward desk instead of a generic daily summary.
- Added stronger closure metrics to the flagship surface so the route reads like a decision point, not just a save button above summaries.
- Tightened the framing of reflections, action routing, board view, and history so the route voice stays about carry-forward decisions instead of general review noise.

## Why this was the right slice

- Health and Areas were already distinct enough after Pass 6A, so the next honest identity gap moved back to the flagship workflow routes.
- Execute and Review already had quieter shell framing and stable interaction cadence, which meant route-voice changes could stay narrow and legible.
- The value here was not more mechanics. The value was making mission work and closure work feel unmistakably different at first scan.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/executeFocusPolish.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Follow-up

There is no automatic Pass 6C. Treat the current UX roadmap as shipped enough for maintenance, and only reopen implementation when a specific regression or bounded new requirement appears.
