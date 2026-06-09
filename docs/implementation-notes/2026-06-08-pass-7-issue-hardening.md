# Pass 7 Issue Hardening

- Task name: `#200 Harden issue bodies and dependency map`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Harden the Pass 7 backlog so execution can proceed by dependency gate instead of chat memory, while avoiding a giant repeated-body rewrite across every GitHub issue.

## Assumptions

- Public issue reads are available through `gh issue view` and `gh issue list`.
- GitHub write operations are not available because the local `gh` token is invalid.
- The safest way to supply missing issue context is one shared repo doc keyed to the existing issue set, not fifty-plus duplicated issue-body edits.

## Decisions

- Added `docs/agent/UI_PASS_7_EXECUTION_MAP.md` as the canonical Pass 7 control-plane supplement.
- Mirrored the important `agent-task` issue-template fields in that map: task type, risk, dependency gate, minimum read set, validation pack, proof expectations, rollback profile, and readiness state.
- Added a global block rule stating that issues `#169` through `#199` are not eligible until issues `#147` through `#168` and `#200` through `#202` are complete.
- Created `docs/agent/UI_PASS_7_GITHUB_UPDATES.md` with the exact GitHub comments to apply later once authenticated write access is restored.

## Deviations

- No GitHub issue bodies or labels were edited directly because `gh auth status` reports the active token is invalid.
- I did not update `.github/ISSUE_TEMPLATE/agent-task.yml` in this issue because screenshot-proof template work belongs to `#158`, not `#200`.

## Tradeoffs

- The shared execution map keeps the backlog maintainable and avoids noisy repeated issue text.
- The cost is that GitHub itself will remain partially under-specified until the pending comments in `docs/agent/UI_PASS_7_GITHUB_UPDATES.md` are applied.

## Files changed and why

- `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
  - Added the dependency map, shared rule packs, per-issue execution matrix, and explicit route-blocking gate.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Recorded the exact GitHub-side comments that should be applied later.
- `docs/implementation-notes/2026-06-08-pass-7-issue-hardening.md`
  - Preserved the governance decisions, auth blocker, and proof trail for this batch.

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

- The execution map is now the shared control-plane source in repo docs, but GitHub issue views will still look lighter until write auth is restored and the pending comments are applied.
- Later phases must keep this map aligned with real execution; if the dependency order changes, this file must be updated first.

## Deferred items

- `#201` label, milestone, and readiness metadata application.
- `#202` final audit rubric wiring to `#198`.

## Rollback notes

- Revert the three files above only.
- Do not roll back unrelated roadmap or route behavior while undoing this governance batch.
