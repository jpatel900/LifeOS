# System Versus Developer Details Boundary

- Task name: `#167 UI Pass 7 14 Standardize system details versus developer details`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Standardize the boundary between recovery-facing system detail and lower-level developer detail before later route hierarchy work continues.

## Assumptions

- The right seam already exists as `DiagnosticsDisclosure`.
- This issue should establish one shared primitive rule now, then let later route issues adopt it more broadly where needed.

## Decisions

- Added `docs/agent/UI_DETAILS_BOUNDARY.md` as the shared rule for what counts as system detail versus developer detail.
- Extended `DiagnosticsDisclosure` with an explicit `detailLevel` contract and `data-detail-level` test seam.
- Used the new `developer` detail level in `Health` for technical save identifiers, while keeping repair-facing system detail visible above it.

## Deviations

- This was not docs-only. The primitive needed a real semantic seam, and `Health` needed one real example so the rule was not empty theory.
- I did not retitle or rework every existing disclosure across the app in this issue.

## Tradeoffs

- The primitive change is deliberately small. It adds one explicit detail-level concept without forcing a broad component rewrite.
- `Health` still exposes the technical identifiers, but now does so in the right place instead of mixing them directly into the first diagnostic layer.

## Files changed and why

- `docs/agent/UI_DETAILS_BOUNDARY.md`
  - Added the shared rule for system versus developer detail.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Routed future UI work to the detail-boundary rule when disclosures or technical detail are in scope.
- `apps/web/src/app/components/DiagnosticsDisclosure.tsx`
  - Added the `detailLevel` contract, default title mapping, and testable detail-level attribute.
- `apps/web/src/app/health/page.tsx`
  - Moved technical save identifiers under an explicit developer disclosure inside Health details.
- `apps/web/src/__tests__/diagnosticsDisclosure.test.tsx`
  - Added focused primitive tests for system and developer detail levels.
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - Added static guard coverage for the detail-boundary docs and disclosure semantics.
- `.github/ISSUE_TEMPLATE/agent-task.yml`
  - Added proof prompts so future route issues must state what stayed in system details versus developer details.
- `docs/PROJECT_STATE.md`
  - Recorded the new shared detail-boundary expectation.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment draft for `#167`.

## Validation commands and results

- `pnpm --filter @lifeos/web test -- src/__tests__/diagnosticsDisclosure.test.tsx src/__tests__/page.test.tsx src/__tests__/capture.test.tsx src/__tests__/healthPage.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - passed

## Risks

- Existing route disclosures still vary in title and content. Later route issues should adopt the new boundary deliberately instead of bulk-relabeling everything.
- Static guard coverage protects the shared seam, not every individual disclosure use.

## Rollback notes

- Revert the detail-boundary doc, the `DiagnosticsDisclosure` primitive change, the Health developer-detail disclosure, the associated tests, the GitHub draft block, and this note together.
