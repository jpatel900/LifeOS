# Shell And Nav Clutter Regression Tests

- Task name: `#162 UI Pass 7 09 Add shell/nav clutter regression tests`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add shell and nav clutter regression coverage before later shell work continues.

## Assumptions

- `#168` now defines the shared mobile surface budget, so `#162` should prove the current shell respects it rather than redefining it.
- The main risk is shell clutter semantics, not just raw overflow: quiet routes must stay quiet, and non-quiet routes must still have one clear shell state.

## Decisions

- Added route-smoke coverage for quiet-route shell behavior.
- Added a focused Playwright suite for mobile shell clutter behavior.
- Kept the assertions aligned to the current shell contract:
  - `/` and `/capture` suppress quick-note controls
  - `/`, `/capture`, `/calendar`, `/execute`, and `/review` suppress the extra shell context band
  - `/triage` remains a non-quiet route with one visible quick-note path and one active nav item

## Deviations

- I did not broaden into new shell behavior changes here. This issue is coverage-first and should only force runtime changes if it catches a real regression.
- I intentionally corrected one over-strict first test after it exposed a wrong assumption about current quick-note scope. That is the right outcome for a regression issue.

## Tradeoffs

- The new suite protects the current shell contract rather than a hypothetical future calmer shell. Later shell issues are still free to change the contract, but they will need to update the proof honestly.
- The coverage is focused and readable, not exhaustive across every route permutation. That is enough for the current risk.

## Files changed and why

- `apps/web/src/__tests__/routeSmoke.test.tsx`
  - Added quiet-route shell assertions and explicit Home/Capture quick-note suppression checks.
- `apps/web/tests/e2e/shell-clutter.spec.ts`
  - Added focused mobile shell clutter coverage for quiet routes and a representative non-quiet route.
- `docs/PROJECT_STATE.md`
  - Recorded the new shell-clutter regression coverage and validation-path expectation.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#162`.
- `docs/implementation-notes/2026-06-11-shell-nav-clutter-regression-tests.md`
  - Recorded scope, decisions, proof, and rollback notes for this test batch.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/shell-clutter.spec.ts`
  - passed
- `git diff --check`
  - pending final full-gate rerun
- `pnpm lint`
  - pending final full-gate rerun
- `pnpm type-check`
  - pending final full-gate rerun
- `pnpm test`
  - pending final full-gate rerun
- `pnpm build`
  - pending final full-gate rerun

## Risks

- The suite intentionally encodes the current shell contract, so later shell-route changes will need careful test updates rather than casual assertion edits.
- Non-quiet routes other than Triage still rely on broader overflow and hierarchy suites rather than their own dedicated shell-clutter cases.

## Deferred items

- Continue to the remaining Pass 7 shared-rule docs issues after the full gate passes.
- Let the later shell and nav implementation issues decide whether more routes should become quiet or whether quick-note scope should shrink further.

## Rollback notes

- Revert the touched tests, the GitHub draft block, the `PROJECT_STATE` note, and this implementation note together.
- Do not keep the new suite if the shell contract is changed without replacing it with an equally explicit regression guard.
