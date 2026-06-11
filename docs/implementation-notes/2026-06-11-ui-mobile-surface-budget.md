# UI Mobile Surface Budget

- Task name: `#168 UI Pass 7 15 Define mobile surface budget rules`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Define the mobile first-viewport surface budget and connect it to review and test expectations.

## Assumptions

- The repo already proves `390px` hierarchy in tests, but the rule was still implicit rather than enforceable as a review contract.
- A small docs-plus-static-test pass is enough here; route behavior tests already exist and should be referenced rather than duplicated blindly.

## Decisions

- Added one compact mobile-surface-budget doc centered on `390px` first-viewport clutter.
- Wired the UI guide and issue template to require explicit budget commentary during review.
- Added a source-of-truth guard so future changes cannot quietly drop the budget doc or its review hook.

## Deviations

- I did not add new Playwright tests in this issue. Existing hierarchy and shell/browser suites already cover the runtime proof; this issue defines and binds the contract.
- I did not create per-route numeric budgets. The rule is intentionally qualitative with a few hard constraints because rigid card-count math would become brittle quickly.

## Tradeoffs

- The budget stays practical rather than mathematically strict, which keeps it useful, but reviewers still need judgment for edge cases.
- Static test coverage protects the presence of the rule, not the full runtime experience. Runtime hierarchy still depends on the existing route/browser suites.

## Files changed and why

- `docs/agent/UI_MOBILE_SURFACE_BUDGET.md`
  - Added the canonical `390px` first-viewport clutter ceiling and shell/route implications.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Routed first-viewport and shell review work through the budget doc.
- `.github/ISSUE_TEMPLATE/agent-task.yml`
  - Added an explicit `Surface budget` note inside UI proof requirements.
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - Added a static guard that the budget doc and review hook remain present.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#168`.
- `docs/implementation-notes/2026-06-11-ui-mobile-surface-budget.md`
  - Recorded scope, decisions, proof, and rollback notes for this docs/tests batch.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts`
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

- Reviewers could still under-enforce the budget if they ignore the required note, but the template and guide now make that omission visible.
- The qualitative budget may need tightening later if a route starts gaming the rule while technically satisfying it.

## Deferred items

- Return to `#162` after this issue passes, since the shell-clutter regression suite depends on this budget contract.
- Use later shell/nav issues to refine route-specific budget pressure without rewriting the shared rule.

## Rollback notes

- Revert the budget doc, the guide and template wiring, the source-of-truth guard, the GitHub draft block, and this note together.
- Do not keep the static guard if the budget doc is removed; that would just create noise instead of governance.
