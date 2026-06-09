# UI Issue Template Proof Guidance

- Task name: `#158 UI Pass 7 05 Add screenshot proof guidance to issue template`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Update issue guidance so route-level UI work requires screenshot proof and a short explanation of what became simpler.

## Assumptions

- The shared agent-task issue template is the right place to carry this requirement instead of repeating it across many issue bodies.
- The template must stay general enough for non-UI work, so any UI-specific field needs a `Not required` escape hatch for non-UI tasks.

## Decisions

- Tightened the acceptance-criteria guidance so route-level UI tasks must include proof and unchanged-boundary checks.
- Added a required `UI proof requirements` field to the issue template.
- Updated the UI validation preset so mobile proof, desktop proof, simplification notes, and unchanged-boundary notes are part of the expected packet for UI issues.

## Deviations

- I did not create the full screenshot evidence workflow or storage convention here; that remains `#164` and `#197`.
- I did not try to rewrite existing issue bodies individually. The template carries the new default guidance.

## Tradeoffs

- A required field adds some friction to all agent-task issues, but the `Not required` option keeps non-UI tasks from becoming awkward while still forcing the author to think.
- The template now asks for proof more explicitly, but it still depends on humans and agents filling it out honestly.

## Files changed and why

- `.github/ISSUE_TEMPLATE/agent-task.yml`
  - Added explicit UI proof guidance for mobile proof, desktop proof, tests run, simplification notes, and intentionally unchanged boundaries.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#158`.
- `docs/implementation-notes/2026-06-08-ui-issue-template-proof-guidance.md`
  - Recorded scope, decisions, proof, and rollback notes for this template pass.

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

- Existing older issues will not retroactively gain this field; only new or manually refreshed issues will.
- Template guidance can still be ignored if reviewers do not enforce it.

## Deferred items

- Define the full screenshot evidence workflow in `#164`.
- Standardize the final screenshot evidence packet in `#197`.

## Rollback notes

- Revert the template change, GitHub draft block, and this note together.
- Do not leave GitHub backfill instructions claiming a template requirement that no longer exists.
