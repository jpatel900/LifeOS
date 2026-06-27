# Capture Hierarchy Recovery

- Task name: `#173-#177 UI Pass 7 Capture hierarchy and raw-save safety batch`
- Status: complete with focused test proof and mobile plus desktop screenshot evidence

## Original scope

Keep Capture raw-input-first while demoting support surfaces and preserving raw-save safety, parse fallback truth, and local draft behavior.

## Decisions

- Treated `#173`, `#174`, and `#175` as mostly satisfied structurally already, then finished the batch through narrower copy, selector, and proof updates instead of reopening the route layout broadly.
- Kept the support summary and deeper details below the main capture card rather than hiding them entirely.
- Closed `#177` through proof, not new behavior: the existing save path already preserved raw text first and already exposed safe parse-failure recovery honestly.

## What changed

- `apps/web/src/app/capture/page.tsx`
  - Tightened the action hierarchy copy so the route now says `Choose what happens next`, `Save the thought now, or send drafts to Triage.`, `Optional area`, `Organize on this device`, and `Keep device-only drafts secondary`.
  - Kept the main raw-input card ahead of the support summary card and `Capture details`.
- `apps/web/src/__tests__/capture.test.tsx`
  - Updated copy and selector expectations to target the actual action controls instead of brittle duplicate text.
  - Kept proof that `Save thought` persists first, that saved captures can be organized afterward, and that parse failure still reports `Raw capture is safely stored`.
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - Added explicit screenshot capture for the mobile first viewport and desktop resting state on `/capture`.
  - Kept browser hierarchy proof that the raw-input surface and primary actions arrive before support summary and deeper diagnostics.
- `apps/web/tests/e2e/workflow-card-accent.spec.ts`
  - Fixed stale disclosure selectors so accent proof follows the current Capture disclosure structure instead of ambiguous text matches.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/routeSmoke.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
  - passed
- `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed

## Screenshot evidence

- `apps/web/test-results/pass-7/173-176-capture-hierarchy/2026-06-11-173-176-capture-mobile-rest.png`
- `apps/web/test-results/pass-7/173-176-capture-hierarchy/2026-06-11-173-176-capture-desktop-rest.png`

Review note:

- Route and state shown: `/capture` at rest on mobile and desktop.
- Primary action stays route-local: raw text entry and the save actions land before support summary and diagnostics.
- Safety truth stayed visible: saved-first and parse-failure states remain covered by focused tests rather than being hidden or removed.
- What moved lower: support metrics, `Capture details`, and device-only draft history stay secondary to the raw-entry job.
- Unchanged: raw-save-first persistence, AI or mock fallback behavior, and the ability to organize a saved capture afterward.

## Risks

- Capture still has multiple secondary surfaces below the fold. That is acceptable for now, but the later visual and accessibility passes should avoid re-promoting them into the first viewport.
- The route now relies more on disclosure labels being stable. If those labels change again, selector quality matters; do not fall back to ambiguous text matches.

## Rollback notes

- Revert the Capture copy adjustments, the updated Capture unit assertions, the `workflow-card-accent` selector cleanup, and the `workflow-hierarchy` screenshot additions together.
