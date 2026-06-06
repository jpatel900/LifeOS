# 2026-06-06 Pass 5A Capture and Planning interaction cadence

## Scope

Started Pass 5 of the active UX roadmap with a narrow route-level slice on Capture and Planning only. This pass tightened action-near feedback rhythm and next-step guidance without changing parser/save truth, persistence, auth, or Google approval behavior.

## What changed

- `apps/web/src/app/capture/page.tsx`
  - Replaced fragmented save/parse feedback rendering with one dominant feedback surface at a time.
  - Parse-in-progress now uses an authored status surface instead of relying only on button-label changes.
  - Save-and-organize no longer leaves the raw-save success stack visible under parse-success; the route resolves to the higher-value next-step state instead.
  - Parse failure now keeps the raw-capture-stored truth visible and keeps retry action local to the same feedback surface.
- `apps/web/src/app/calendar/page.tsx`
  - Replaced the plain muted `Saving ...` line with authored in-flight planning feedback.
  - Added `Review next suggested time block` immediately after suggestion-oriented success states so the next useful move is visible near the confirmation.
- `apps/web/src/__tests__/capture.test.tsx`
  - Added regression proof that save-and-organize resolves to the Triage-ready surface instead of stacking the raw-save action surface underneath it.
  - Added proof that safe parse failure still keeps the raw-capture-stored truth visible.
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - Added proof that suggestion-oriented Planning success states expose the next review action inline.

## Why this slice matters

Before this pass, Capture and Planning were technically honest but rhythmically inconsistent: save/parse could compete on Capture, and Planning pending states dropped back to flat muted status text while some success states still left the next useful move visually implicit. This pass makes those routes feel more like one authored system without touching their underlying contracts.

## Validation

- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx`
- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/interaction-feedback.spec.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Outcome

Pass 5 is now active with a concrete shipped baseline. The next honest extension is Execute and Review, where action closure and recovery feedback should now be tightened to match the authored cadence established on Capture and Planning.
