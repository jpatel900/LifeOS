# UI Information Hierarchy Doctrine

- Task name: `#155 UI Pass 7 02 Add UX information hierarchy doctrine`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Document the hierarchy for user action truth, safety truth, diagnostic truth, and developer truth so future UI work can place content intentionally instead of letting every route improvise.

## Assumptions

- The repo already has strong instincts about truthfulness, but the placement rule is still implicit across notes and route code.
- The doctrine should be short, operational, and route-usable. If it becomes a philosophy doc, agents will ignore it.

## Decisions

- Added `docs/agent/UI_INFORMATION_HIERARCHY_DOCTRINE.md` as the compact rule set for primary-route versus details versus Health placement.
- Updated the Pass 7 roadmap row so the doctrine is now part of the active acceptance framing for the recovery pass.
- Updated `docs/agent/UI_AGENT_GUIDE.md` so future UI work loads the doctrine when copy, degraded states, or diagnostics staging are in scope.
- Added one durable implementation note to `docs/PROJECT_STATE.md` so the rule shows up in the shipped-truth handoff path too.

## Deviations

- I did not yet create the fuller UI review guide. That remains `#156`.
- I did not update tests or runtime routes yet. This issue is the doctrine only.

## Tradeoffs

- The doctrine is intentionally compressed, which keeps it usable but means later route issues still need concrete examples and proof.
- Putting one summary line into `PROJECT_STATE` adds a little policy to the handoff doc, but this one is durable enough to belong there.

## Files changed and why

- `docs/agent/UI_INFORMATION_HIERARCHY_DOCTRINE.md`
  - Added the four-truth hierarchy, placement rules, promotion rules, route implications, and fast decision test.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the doctrine to the Pass 7 acceptance framing and required proof list.
- `docs/agent/UI_AGENT_GUIDE.md`
  - Added routing guidance so UI agents load the doctrine when relevant.
- `docs/PROJECT_STATE.md`
  - Added one durable handoff rule capturing the hierarchy.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#155`.
- `docs/implementation-notes/2026-06-08-ui-information-hierarchy-doctrine.md`
  - Preserved the scope and proof for this doctrine pass.

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

- The doctrine still relies on later tests and route work to enforce it.
- If later passes start adding exceptions casually, this will turn back into taste-driven UI drift.

## Deferred items

- Add or update the UI review guide in `#156`.
- Update routing docs again in `#157` if the review-guide path changes.

## Rollback notes

- Revert the doctrine doc, roadmap row, UI agent guide note, `PROJECT_STATE` line, and this note together.
- Do not leave the roadmap or handoff doc referring to a doctrine that no longer exists.
