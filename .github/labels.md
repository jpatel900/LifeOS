# Recommended issue labels

Use labels to show agent readiness, owning surface, expected risk, and automation eligibility cues under `.github/AGENT_AUTOMATION_POLICY.md`.

## Agent routing

- `agent:ready` - The issue is bounded enough for an agent to start.
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

## Suggested combinations

- Typical bounded UI task: `agent:ready`, `agent:codex`, `area:ui`, `risk:low`
- Test hardening task: `agent:ready`, `agent:codex`, `area:tests`, `risk:medium`
- Calendar or security-sensitive task: `area:calendar` or `area:security`, plus the matching risk label, and add `needs:human-decision` when explicit approval is still missing
