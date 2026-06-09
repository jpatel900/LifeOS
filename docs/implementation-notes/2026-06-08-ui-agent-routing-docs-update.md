# UI Agent Routing Docs Update

- Task name: `#157 UI Pass 7 04 Update agent routing docs for UI work`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Update agent routing docs so UI work points to the active roadmap and UI review guide before implementation.

## Assumptions

- The repo already had the right documents; the problem was ordering and minimal-path clarity.
- `PROJECT_STATE` should stay available, but it should not outrank the active roadmap, review guide, or touched route proof for ordinary UI implementation.

## Decisions

- Updated `docs/agent/CONTEXT_INDEX.md` so the UI path reads roadmap -> UI review guide -> Pass 7 execution map -> touched route source and tests -> `PROJECT_STATE` only when needed.
- Updated `docs/agent/REPO_MAP.json` so `pnpm agent:context ui` reflects the same smaller path.
- Added `pnpm agent:context ui` to the UI quick checks because this issue is about the routing surface itself.

## Deviations

- I did not widen the path to include the doctrine by default. The review guide already routes into the doctrine only when the task touches hierarchy, degraded states, or diagnostics staging.
- I did not change broader docs guidance outside the `ui` path.

## Tradeoffs

- Moving `PROJECT_STATE` out of `readFirst` reduces context load, but it means agents must be disciplined enough to pull it only when they actually need shipped-truth status.
- Keeping the doctrine indirect preserves minimal context at the cost of one extra hop for hierarchy-heavy route work.

## Files changed and why

- `docs/agent/CONTEXT_INDEX.md`
  - Clarified that UI work should read the roadmap and review guide before implementation and before defaulting to `PROJECT_STATE`.
- `docs/agent/REPO_MAP.json`
  - Made `pnpm agent:context ui` reflect the same smaller context order and added a direct quick check for that command.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#157`.
- `docs/implementation-notes/2026-06-08-ui-agent-routing-docs-update.md`
  - Recorded scope, decisions, proof, and rollback notes for this routing pass.

## Validation commands and results

- `pnpm agent:context ui`
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

- If later docs work puts `PROJECT_STATE` back into the default path casually, the minimal context rule will drift again.
- Agents can still over-read if they ignore the routing order; this issue reduces ambiguity but does not enforce behavior mechanically.

## Deferred items

- Require screenshot and proof expectations directly in issue guidance in `#158`.

## Rollback notes

- Revert the context index, repo map, GitHub draft block, and this note together.
- Do not leave `pnpm agent:context ui` claiming a smaller path than the written routing docs.
