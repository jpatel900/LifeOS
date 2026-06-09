# Pass 7 Label Plan

- Task name: `#201 Apply labels milestone and readiness states`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Define the Pass 7 label taxonomy, readiness-state policy, and milestone grouping so the backlog can be filtered without inventing a second conflicting metadata system.

## Assumptions

- Existing repository labels are a better starting point than a brand-new label vocabulary.
- GitHub write access is still unavailable in this environment, so the output must be a local plan rather than applied metadata.
- A milestone is enough for ordering and status; a second GitHub Project board would add noise, not clarity.

## Decisions

- Reused existing `area:*`, `risk:*`, and `agent:*` labels wherever they already match the requested intent.
- Mapped `ready-for-codex` to existing `agent:ready` instead of creating a duplicate synonym.
- Added only the missing route, quality, and readiness labels in the local plan.
- Chose one milestone only: `UI UX Recovery Epic Pass 7`.
- Kept `needs:human-decision` separate from the new proposed `needs:human-review` label because review and decision are not the same thing.

## Deviations

- No labels or milestone were created directly because `gh auth status` still reports an invalid token.
- The branch rename attempt failed due a local `.git/logs` permission error, so the current branch name remains narrower than the actual phase scope. That is housekeeping debt, not a correctness blocker.

## Tradeoffs

- Reusing existing labels avoids a messy dual taxonomy, but the mapping is slightly less literal than the original requested plain names.
- Not creating a project board keeps the control plane simpler, but relies on milestone and label filters being used consistently.

## Files changed and why

- `docs/agent/UI_PASS_7_LABEL_PLAN.md`
  - Added the canonical Pass 7 label strategy, milestone choice, readiness policy, and exact issue-to-label mapping.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#201`.
- `docs/implementation-notes/2026-06-08-pass-7-label-plan.md`
  - Preserved the metadata decisions and the GitHub auth blocker.

## Validation commands and results

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

- The repo now has a local canonical label plan, but GitHub itself will remain out of sync until authenticated write access is restored.
- If maintainers ignore the reuse policy and create duplicate plain-name labels anyway, the backlog will become harder to filter rather than easier.

## Deferred items

- Apply the label plan and milestone after GitHub auth is restored.
- Wire the final audit rubric in `#202`.

## Rollback notes

- Revert the three files above only.
- Do not alter execution-order docs while rolling back metadata planning.
