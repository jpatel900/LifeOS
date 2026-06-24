# 2026-06-24 - CI heavy-job path gating

Status: Implemented on `docs/system-review-2026-06-23`
Why: The 2026-06-23 system review found that docs-only pull requests still ran the full Playwright e2e and migrations/RLS jobs. This was wasting roughly nine CI minutes per docs-only PR.

## Changes

- `.github/workflows/ci.yml`
  - Added a `changes` job that classifies `pull_request` diffs before the heavy jobs.
  - Kept `validate-monorepo` unconditional.
  - Gated `e2e` and `migrations-rls` with `if: needs.changes.outputs.heavy == 'true'`.
  - Kept `push` to `main` on the full suite by forcing `heavy=true` outside `pull_request`.
  - Used the intentionally minimal trigger set selected for this task: `apps/web/**` and `supabase/**`.
- `docs/KNOWN_ISSUES.md`
  - Resolved registry row `#9` with the actual gated-path behavior and rationale.
- `docs/PROJECT_STATE.md`
  - Updated the 2026-06-23 system-review summary so the shipped-truth handoff matches the workflow behavior.

## Decisions

- Kept job-level `if` gating instead of workflow-level `paths` filters so required checks do not disappear on docs-only PRs.
- Did not broaden the trigger set to `packages/**`, workflow files, or manifests even though those can affect runtime behavior. The selected scope for this task was intentionally minimal.

## Validation

- `git diff --check`
- manual review of the `changes` job behavior for:
  - docs-only PRs
  - `.github/ISSUE_TEMPLATE/**`-only PRs
  - `apps/web/**` PRs
  - `supabase/**` PRs
  - `push` to `main`

## Risks and limitations

- The minimal path set can miss shared-package or workflow-only changes that still justify running the heavy jobs. If that becomes a real problem, widen the trigger set in a separate follow-up instead of silently broadening this change.

## Rollback

- Revert the `ci.yml`, `KNOWN_ISSUES.md`, and `PROJECT_STATE.md` changes from this branch. No app/runtime code or database state changed.
