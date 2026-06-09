# Degraded State Severity Tests

- Task name: `#161 UI Pass 7 08 Add degraded-state severity tests`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add tests that distinguish recoverable degraded states from blocked states.

## Assumptions

- The new severity vocabulary from `#165` is the contract for this issue.
- A truthful severity test needs narrow runtime alignment where existing route tone contradicts that contract.

## Decisions

- Added focused Home and Health tests that cover `warning`, `info`, and `danger` semantics instead of relying on prose alone.
- Corrected the Home degraded account-data alert from destructive to warning because local workflow remains usable.
- Added canonical `data-severity` attributes to key Health status surfaces so tests can assert semantic severity without depending only on CSS color tokens.

## Deviations

- This issue required a small runtime fix on Home and semantic hooks on Health, not just new tests.
- I did not broaden into later degraded-copy cleanup or shared component refactors. The goal here is testable severity truth, not a global alert-system redesign.

## Tradeoffs

- `data-severity` is an intentional test seam. It adds minor markup noise, but it is far better than locking severity tests to exact color classes alone.
- Home now reads calmer under partial account-data degradation, which is correct for the current behavior, but later Home UX issues still need to refine the full degraded-state copy set.

## Files changed and why

- `apps/web/src/app/page.tsx`
  - Changed the recoverable Home account-data degraded alert from destructive to warning and marked it with canonical severity.
- `apps/web/src/app/health/page.tsx`
  - Added a local helper to map current primitive variants to canonical severity and exposed that on run feedback plus key trust badges.
- `apps/web/src/__tests__/page.test.tsx`
  - Added a severity assertion so Home degraded account-data state is treated as recoverable warning, not a hard failure.
- `apps/web/src/__tests__/healthPage.test.tsx`
  - Added `info`, `warning`, and `danger` severity checks for optional-disabled, disconnected-calendar, and blocked-error states.
- `docs/PROJECT_STATE.md`
  - Recorded the new severity proof and the corrected Home degraded-state behavior.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#161`.
- `docs/implementation-notes/2026-06-08-degraded-state-severity-tests.md`
  - Recorded scope, decisions, proof, and rollback notes for this batch.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/healthPage.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
  - passed
- `pnpm install --frozen-lockfile`
  - passed
- `git diff --check`
  - passed with LF to CRLF normalization warnings only
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- `data-severity` is currently added only where this issue needed proof. Later degraded-state work may need to extend the same pattern to other route surfaces.
- Some existing route copy may still need additional cleanup in `#166` even though the severity contract is now testable.

## Deferred items

- Continue to `#162` or the next dependency-ready Phase 3 issue only after the final validation gate passes.
- Use the later degraded-state copy issue to normalize any remaining route text that still feels harsher or less explicit than the new severity rule.

## Rollback notes

- Revert the Home and Health route changes, the focused tests, the GitHub draft block, and this note together.
- Do not keep the severity tests if the runtime severity correction is rolled back; that would return the branch to dishonest proof.
