# Diagnostics Before Action Regression Tests

- Task name: `#163 UI Pass 7 10 Add diagnostics-before-action regression tests`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add regression proof that diagnostics do not appear before the primary action unless the route is actually blocked.

## Assumptions

- `#160` already owns the first-viewport contract for Home and Capture.
- `#163` should add more direct structure-level protection so later UI work does not reintroduce support or diagnostics above the main route task.

## Decisions

- Added DOM-order assertions for Home and Capture so their key details and disclosures stay after the route’s primary action surfaces.
- Expanded shell smoke coverage so Home now joins the quiet-shell route set alongside Capture, Planning, Execute, and Review.
- Fixed the actual regression instead of weakening the Playwright check: `/` now suppresses the shell context band because it was crowding Home above the route-local launchpad.

## Deviations

- This issue required a narrow runtime fix in `AppShell`, not just new tests, because the existing Home shell context band directly violated the contract the tests were supposed to prove.
- I did not broaden into a shell redesign. The change is one route added to the existing quiet-shell set.

## Tradeoffs

- Home loses one shell-level support disclosure, but that content was redundant and materially harmed first-scan hierarchy.
- The new structure tests are intentionally simple DOM-order checks. They do not replace viewport proof; they back it up with a cheaper regression seam.

## Files changed and why

- `apps/web/src/app/components/AppShell.tsx`
  - Added `/` to the quiet-shell route set so the shell context band no longer competes with Home’s route-local flagship card.
- `apps/web/src/__tests__/page.test.tsx`
  - Added a direct order assertion that `Today details` stays after the primary next action.
- `apps/web/src/__tests__/capture.test.tsx`
  - Added direct order assertions that local-draft and diagnostics details stay after Capture’s primary actions.
- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Extended shell smoke coverage so Home is explicitly protected from the extra shell context band.
- `docs/PROJECT_STATE.md`
  - Recorded the shipped Home shell-quiet truth and the new diagnostics-before-action proof.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#163`.
- `docs/implementation-notes/2026-06-11-diagnostics-before-action-regression-tests.md`
  - Recorded scope, decisions, proof, and rollback notes for this batch.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/page.test.tsx src/__tests__/capture.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
  - passed
- `git diff --check`
  - passed with LF to CRLF normalization warnings only
- `pnpm install --frozen-lockfile`
  - passed
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- Home’s shell-quiet treatment is now more route-specific. If future shell work changes which routes own their own top-of-page context, those choices need explicit regression updates.
- The Playwright run emitted a non-failing webpack cache rename warning under `.next`; it did not invalidate the passing suite, but it is worth watching if local dev cache behavior gets noisier on Windows.

## Deferred items

- Continue to the next dependency-ready Pass 7 issue only after the final full gate passes.
- Let later shell and nav issues decide whether any additional routes should join or leave the quiet-shell set; do not broaden that decision inside `#163`.

## Rollback notes

- Revert the `AppShell` route-set change, the touched tests, the GitHub draft block, and this note together.
- Do not keep the new diagnostics-order tests if Home is allowed to regain shell support content above its flagship card; that would make the proof dishonest again.
