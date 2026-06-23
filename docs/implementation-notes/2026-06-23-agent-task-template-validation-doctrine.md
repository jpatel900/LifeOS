# 2026-06-23 - Agent task template and validation doctrine cleanup

Status: Implemented on `docs/205-206-210-agent-task`
Why: The open governance issues found two real control-plane problems: the Agent Task template forced meaningless UI-proof boilerplate onto non-UI work, and the repo had separate T0-T4 policy tiers plus a change-type validation matrix without a clear crosswalk.

## Changes

- `.github/ISSUE_TEMPLATE/agent-task.yml`
  - Added `workflow` and `agent-governance` task types so control-plane work no longer has to masquerade as `docs`.
  - Made `ui_proof_requirements` optional, with explicit wording that UI work still requires it and non-UI work should leave it blank because GitHub forms cannot enforce conditional required fields.
  - Tightened `validation_commands` guidance so issue authors choose commands from the touched surface plus `docs/agent/VALIDATION_MATRIX.md` and the highest T0-T4 tier instead of assuming full repo validation for every docs-only task.
  - Updated validation presets so `workflow` and `agent-governance` are named explicitly.
- `docs/agent/VALIDATION_MATRIX.md`
  - Reworked the file into the canonical change-type to T0-T4 crosswalk instead of a parallel unlabeled checklist.
  - Added a tier column and final-completion expectations so low-risk docs work can stay narrow while T3 surfaces still clearly escalate to full high-risk validation.
- `docs/agent/CODEX_PROMPT_TEMPLATE.md`
  - Added an explicit link to `docs/agent/VALIDATION_MATRIX.md` so medium/high-risk prompts can choose focused iteration checks without copying validation doctrine into every prompt.

## Decisions

- GitHub issue forms still cannot express "required only when task type is UI" behavior cleanly, so the least-bad design is an optional field with sharp wording rather than a globally required field that invites theater.
- `workflow` and `agent-governance` are enough taxonomy to cover the confirmed gap from PR `#221`; adding `automation` as a third near-synonym would be taxonomy bloat.
- The validation matrix should stay a crosswalk anchored to `.github/AGENT_AUTOMATION_POLICY.md`, not become a second independent risk policy.

## Validation

- `pnpm format:check`
- `git diff --check`

## Risks and limitations

- The issue template cannot enforce conditional UI proof mechanically; it now relies on clearer instructions rather than fake-required boilerplate.
- The validation matrix still requires human judgment when a change spans multiple surfaces; the rule is to apply the stricter tier, not to average them.

## Rollback

- Revert the template and docs-only control-plane changes in this branch. No runtime behavior, workflows, or automation scripts changed.
