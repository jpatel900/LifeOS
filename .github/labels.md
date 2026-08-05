# Recommended issue labels

Use labels to show agent readiness, owning surface, expected risk, and automation eligibility cues under `.github/AGENT_AUTOMATION_POLICY.md`.

## Agent routing

- `agent:ready` - The issue is bounded enough for an agent to start.
- `agent:claimed` - An agent has claimed this issue (AGENTS.md claim-before-building rule); do not start work on it.
- `agent:plan` - Run the read-only planning packet workflow for medium/high-risk or unclear tasks before implementation.
- `agent:codex` - Good fit for Codex execution.
- `agent:cursor` - Good fit for Cursor execution.

## Risk

- `risk:low` - Narrow change with low blast radius.
- `risk:medium` - Moderate scope or moderate verification burden.
- `risk:high` - Higher blast radius, deeper review needed.

## Area

- `area:ui` - UI and UX behavior.
- `area:tests` - Test-only or test-heavy work.
- `area:docs` - Docs or repo-maintenance work.
- `area:parser` - AI parsing or schema-adjacent parser work.
- `area:calendar` - Calendar planning, approval, or external-write surfaces.
- `area:security` - Security, privacy, auth, or approval-gate work.

## Escalation

- `needs:human-decision` - The issue is blocked on scope, policy, approval, or risk decisions a human must make.
- `automerge:safe` - The issue is explicitly approved for the T0 safe auto-merge lane when deterministic path checks also pass.
- `automerge:tests-additive` - Strictly-additive test-only PR opting into the ADR 0008 move-1b auto-merge route; the guard verifies test-paths-only and zero deleted lines.
- `selfmerge:auto` - Low-risk agent PR opting into instant self-merge (ADR 0008 move 2 as amended 2026-08-05): owner gets a Telegram notice, auto-merge arms immediately, CI runtime is the veto window. `selfmerge:30m` remains as a legacy alias.
- `agent:claimed` - An agent has claimed this issue and is actively working it; do not start parallel work (AGENTS.md claim-before-build rule).
- `usability` / `enjoyability` - Lane labels driving the two-lane work-map view; apply one at issue creation.

## Main Red Guard revert PRs (owner decision 2026-08-05: notify and hold)

Guard revert PRs open HELD and never arm auto-merge on their own.

- `revert:confirm` - A human confirms the revert: auto-merge arms and the revert lands once its checks pass. Only a person adds this. Ignored when `revert:wont-fix` is also present.
- `revert:wont-fix` - Applied by the guard itself when the revert PR's own CI fails the same job that made main red: reverting will not restore green, so a forward fix is indicated.

## Suggested combinations

- Typical bounded UI task: `agent:ready`, `agent:codex`, `area:ui`, `risk:low`
- Test hardening task: `agent:ready`, `agent:codex`, `area:tests`, `risk:medium`
- Calendar or security-sensitive task: `area:calendar` or `area:security`, plus the matching risk label, and add `needs:human-decision` when explicit approval is still missing
