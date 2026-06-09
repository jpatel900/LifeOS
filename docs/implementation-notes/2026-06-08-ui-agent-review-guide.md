# UI Agent Review Guide

- Task name: `#156 UI Pass 7 03 Add UI agent review guide`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Add the review guide agents should use before marking UI work complete, with explicit expectations for behavior checks, screenshots, tests, and route proof.

## Assumptions

- The repo already had a compact UI routing guide, so the right move was to expand that file instead of creating a competing guide.
- The guide should stay operational and short enough that agents will actually use it during route work.

## Decisions

- Expanded `docs/agent/UI_AGENT_GUIDE.md` into both a context guide and a review guide.
- Added a review loop, behavior checklist, screenshot proof section, test and command expectations, and route-proof note requirements.
- Updated the active roadmap so Pass 7 now explicitly requires behavior, test, and screenshot proof before UI completion claims.
- Added one concise `PROJECT_STATE` note so the proof expectation remains visible in the normal handoff path.

## Deviations

- I did not update broader routing docs in `docs/agent/CONTEXT_INDEX.md` or `docs/agent/REPO_MAP.json`; that remains `#157`.
- I did not create the later screenshot workflow doc; that remains `#164`.

## Tradeoffs

- Keeping review guidance in the same file as routing guidance avoids duplication, but it makes `UI_AGENT_GUIDE.md` a little denser.
- The screenshot section is intentionally lightweight now; later evidence-workflow issues can add storage and packet details without reopening the completion standard itself.

## Files changed and why

- `docs/agent/UI_AGENT_GUIDE.md`
  - Expanded the file into the active UI review guide with behavior, screenshot, test, and route-proof expectations.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Added the review guide to Pass 7 acceptance framing and required proof.
- `docs/PROJECT_STATE.md`
  - Added one durable note that UI completion claims require behavior checks plus proof, not just docs or lint.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#156`.
- `docs/implementation-notes/2026-06-08-ui-agent-review-guide.md`
  - Recorded scope, decisions, proof, and rollback notes for this pass.

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

- The guide defines proof expectations, but later test and screenshot-workflow issues still need to make those expectations harder to skip.
- If future route work claims exemptions casually, the review guide will weaken into advice instead of a gate.

## Deferred items

- Update broader agent routing docs in `#157`.
- Define the screenshot evidence workflow in `#164`.

## Rollback notes

- Revert the guide expansion, roadmap row, `PROJECT_STATE` line, GitHub draft block, and this note together.
- Do not leave the roadmap or handoff docs pointing to a review standard that no longer exists.
