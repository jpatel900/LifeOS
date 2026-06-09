# UI UX Roadmap Consolidation

- Task name: `#148 Consolidate active UI UX planning into one roadmap`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Make `docs/UI_UX_WORLD_CLASS_ROADMAP.md` the unmistakable single active UI/UX plan and reduce the risk that older plan documents will be mistaken for the current execution queue.

## Assumptions

- The current contradiction is explicit: the roadmap still said there was no active implementation pass even though Pass 7 now exists.
- The smallest safe fix is to correct the roadmap itself before demoting or archiving the historical docs.
- The old `docs/ux/*` and `docs/superpowers/*` plan/spec docs should be marked as historical inputs here before `#149` handles broader demotion or archival.

## Decisions

- Updated `docs/UI_UX_WORLD_CLASS_ROADMAP.md` so it now states Pass 7 is the active program state.
- Added a Pass 7 row to the ordered pass queue with proof-routing links to the new Pass 7 control-plane docs.
- Replaced `No active implementation pass` with `Active implementation pass: 7`.
- Added the older `docs/ux/*` and `docs/superpowers/*` UX plan/spec docs to the roadmap's historical-input list.

## Deviations

- I did not yet add status headers to the historical docs themselves. That belongs to `#151`.
- I did not archive or move any historical docs yet. That belongs to `#149`.

## Tradeoffs

- The roadmap is slightly more explicit than before, but the edit removes a live contradiction and reduces the chance of agents following stale plan documents.
- Keeping the historical plan/spec docs in place for now avoids premature file churn before the later archive/demotion pass.

## Files changed and why

- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Marked Pass 7 as active, clarified that Passes 0 through 6 are historical/shipped context, and expanded the historical-input list.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#148`.
- `docs/implementation-notes/2026-06-08-ui-ux-roadmap-consolidation.md`
  - Preserved the roadmap-consolidation decisions and boundaries.

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

- The roadmap is now singular at the top level, but the historical docs can still confuse future agents until they get their own explicit status treatment in `#149` and `#151`.

## Deferred items

- Demote or archive the historical docs in `#149`.
- Add status headers to the relevant UI/UX docs in `#151`.
- Tighten context routing in `#152`.

## Rollback notes

- Revert the three files above only.
- Do not demote or archive any historical docs as part of rolling back this roadmap fix.
