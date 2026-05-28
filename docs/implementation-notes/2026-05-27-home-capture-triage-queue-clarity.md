# 2026-05-27 Home Capture Triage Queue Clarity

## Summary

Resolved the next safe UX batch for issues `#84`, `#85`, and `#86` without changing persistence, schema, auth, parser, or Google Calendar boundaries.

- Home now keeps one dominant next action and suppresses empty/system-secondary cards until they are relevant.
- Capture now explains save-and-organize outcomes more directly and translates recent capture statuses into human lifecycle labels.
- Triage now shows one current review item plus an explicit up-next queue instead of expanding every draft equally.

## Files changed

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/__tests__/page.test.tsx`
- `apps/web/src/__tests__/capture.test.tsx`
- `apps/web/src/__tests__/triage.test.tsx`
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- `docs/PROJECT_STATE.md`

## Validation

- `pnpm --filter @lifeos/web test -- page.test.tsx capture.test.tsx triage.test.tsx routeSmoke.test.tsx sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test -- triage.test.tsx phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`

## Risks

- The Triage queue now has intentional focus behavior. Tests and future UI work cannot assume every draft stays expanded at once.
- Home hides empty planning/recovery/system cards by default now. Future changes that rely on those cards being always present need explicit reconsideration.

## Rollback

- Revert this branch or restore the previous versions of the three route files plus their updated tests.
- If a rollback is partial, keep `phase4aPersistence.test.tsx` aligned with whichever triage presentation is actually shipped.
