# 2026-06-06 - Pass 3A triage explanation reduction

## Scope

Closed the remaining Triage slice of roadmap Pass 3A: reduce explanation-by-default without changing queue semantics, save boundaries, persistence behavior, or browser-note honesty.

## Runtime changes

- Shortened the Triage editorial description so the route purpose is legible faster.
- Compressed the header metric helper copy for current item, waiting queue, and save behavior.
- Tightened the `Current focus` helper sentence.
- Shortened the saved-context loading copy and empty-state guidance.
- Tightened the current-item helper sentence and both task/project decision helper paragraphs.
- Compressed the browser-note helper copy while keeping the same device-only truth boundary.

## Files changed

- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/__tests__/triage.test.tsx`
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/triage.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`

## Notes

- This closes Pass 3A across Capture, Planning, and Triage.
- Pass 3 remains active overall because Review and Areas still carry too much explanation below the fold.
