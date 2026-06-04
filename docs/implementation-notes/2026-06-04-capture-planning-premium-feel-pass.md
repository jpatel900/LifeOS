# 2026-06-04 Capture and Planning Premium-Feel Pass

## Scope

This pass stayed inside the current Capture and Planning routes plus the proof surfaces that already guard their truth boundaries:

- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/__tests__/capture.test.tsx`

No schema, persistence boundary, auth flow, parser contract, route name, or Google Calendar approval rule changed.

## What changed

- Capture now opens with a stronger `Raw first` header composition instead of a flat route intro.
- Capture surfaces `Save mode`, `Sorting help`, and `Current area` as structured spotlight metrics so the user can orient in one glance instead of reading admin-style helper sentences.
- Capture now uses a clearer action tray for `Save thought` versus `Save and organize`, with faster wording and a calmer area side panel.
- Capture save and organize confirmations now use stronger micro-closure styling without hiding the real destination or parser truth.
- Planning now opens with a stronger `Local-first planning` header composition and a spotlight summary for what needs time, what is ready to review, and what is already planned.
- Planning keeps the existing `Planning flow` contract, but now frames it as one guided next-move surface instead of another stacked process box.
- Planning save feedback now uses the same stronger closure styling while keeping explicit save-mode and block labels visible.

## Why this pass

The previous declutter work removed some of the noise, but these two screens still made the user work too hard in the first few seconds. Capture still felt like a form with explanations. Planning still felt like proposal administration. This pass was about lowering interpretation cost and making the product feel more intentional without weakening truthfulness.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/workflow-hierarchy.spec.ts`

## Risk

Low. The only regression found was test drift from older literal copy assertions (`Organization help: ...`) after the new structured spotlight landed. That proof was updated to the newer `Sorting help` contract before completion.
