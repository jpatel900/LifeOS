# 2026-06-04 Triage Premium-Feel Pass

## Scope

This pass stayed inside the current Triage route and its existing proof surfaces:

- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/__tests__/triage.test.tsx`

Browser proof used the existing P0 and hierarchy suites:

- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

No queue semantics, persistence boundary, auth flow, route name, or browser-note honesty rule changed.

## What changed

- Triage now opens with a stronger `One decision at a time` editorial header instead of a plain title block.
- The route now exposes queue/save-orientation metrics so the user can understand the current state without scanning the whole page.
- `Current focus` now behaves more like a real next-move tray and less like a generic utility card.
- Acceptance success now has stronger handoff framing toward Planning while keeping the real save destination explicit.
- The `Decide` sections for task and project drafts now read like narrower decision surfaces instead of blunt action rows.

## Why this pass

Capture and Planning had already moved closer to a publishable product feel. Triage was still too obviously “internal tool UI” in between them. That made the overall flow feel less premium than it should. This pass closes that gap without reopening the already-stable current-item queue behavior.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/triage.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`

## Risk

Low. The only regression found was stale test proof that assumed `Current item` appeared once. The new header spotlight made that string intentionally appear twice, so the proof was hardened to the newer structure instead of weakening the route.
