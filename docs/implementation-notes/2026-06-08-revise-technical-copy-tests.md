# Revise Technical Copy Tests

- Task name: `#159 UI Pass 7 06 Revise technical copy tests`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Revise tests that preserve technical copy in primary workflow surfaces.

## Assumptions

- The current source-of-truth and focused route tests were overfitted to technical labels that Pass 7 intends to demote or move.
- The safe change is to preserve behavior and safety assertions while removing exact dependencies on provider-jargon labels from primary workflow-route tests.

## Decisions

- Updated `sourceOfTruth.test.ts` so it still protects user-facing action and safety copy, but no longer requires `Save mode:` or `Technical save mode id:` across primary workflow routes.
- Removed route-test assertions in Capture and Phase 4A persistence coverage that pinned primary surfaces to those same technical labels.
- Kept Health as the intentional surface where technical save-mode detail can still be asserted directly.

## Deviations

- I did not change runtime route copy in this issue. This is the test-contract cleanup only.
- I did not touch later degraded-state or first-viewport tests yet; those belong to later Pass 7 issues.

## Tradeoffs

- These tests are now less brittle about exact wording, which is the point, but it means later route issues must keep meaningful behavior assertions rather than relying on one exact label.
- The coverage still tolerates existing technical detail in route code today. It simply stops treating that copy as a required part of the primary-route contract.

## Files changed and why

- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - Removed technical-copy requirements from primary workflow-route assertions while keeping user-facing action, safety, and Health-detail coverage.
- `apps/web/src/__tests__/capture.test.tsx`
  - Removed a `Save mode:` assertion that locked Capture to technical label copy instead of user-facing behavior.
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - Removed technical-label assertions from Areas, Capture, and Review persistence scenarios while keeping persistence-truth behavior checks.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#159`.
- `docs/implementation-notes/2026-06-08-revise-technical-copy-tests.md`
  - Recorded scope, decisions, proof, and rollback notes for this test-hardening pass.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx`
  - passed
- `git diff --check`
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

- Some remaining route tests may still preserve clutter-heavy user-facing copy that later Pass 7 issues will need to loosen.
- Because runtime copy was not changed here, the app still contains technical labels that later UI issues must demote or restage.

## Deferred items

- Add first-viewport tests in `#160`.
- Add degraded-state and diagnostics-order tests in later Phase 3 issues.

## Rollback notes

- Revert the touched tests, the GitHub draft block, and this note together.
- Do not restore technical-copy assertions casually; they would directly fight the Pass 7 doctrine and review guide.
