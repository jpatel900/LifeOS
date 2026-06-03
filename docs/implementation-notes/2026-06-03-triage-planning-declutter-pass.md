# 2026-06-03 Triage and Planning Declutter Pass

## Scope

This pass stayed inside the current Triage and Planning routes plus the focused browser proof that covers them:

- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`

No schema, persistence boundary, auth flow, parser contract, or Google Calendar approval rule changed.

## What changed

- Triage now shows the current item as the clear working surface and removes the extra backlog-warning card.
- Triage keeps accept/reject/edit visible, but moves AI context, draft notes, and browser-note actions behind disclosures so they stop competing with the decision path.
- Triage now shows only a short visible slice of the queue after the current item; additional queued items sit behind one disclosure instead of creating a wall of equal-weight cards.
- Planning now shows only the next task that needs time, the next suggested block to review, and a short visible slice of already planned blocks by default.
- Additional tasks, proposals, and planned blocks now sit behind disclosures instead of rendering as full first-class cards immediately.
- Google first-write approval stays explicit, but now lives inside the existing Google Calendar options disclosure rather than adding more always-open visual weight to the proposal card.
- Proposal reject is now a quieter `More options` path instead of a separate always-open section.

## Why this pass

The previous Home/Execute pass improved focus on the arrival and execution moments, but Triage and Planning still forced too much equal-weight reading. The problem was not missing visual polish. It was that too many secondary decisions stayed visible at once. This pass reduces that default cognitive load without weakening truthfulness or external-write safety.

## Validation

Passed:

- `pnpm --filter @lifeos/web test -- src/__tests__/triage.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm type-check`

Validation note:

- `pnpm type-check` hit the known transient `.next/types` generation race on the first full run (`.next/types/app/layout.ts` missing), then passed immediately when rerun after `pnpm build`. No app-code fix was required.
