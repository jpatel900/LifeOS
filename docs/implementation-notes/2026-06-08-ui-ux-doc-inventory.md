# UI UX Doc Inventory

- Task name: `#147 Inventory UI UX docs and classify authority`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Inventory the UI/UX-related docs, classify their role, and identify the documents most likely to confuse future agents about what is active versus historical.

## Assumptions

- The inventory should focus on docs that can materially influence UI/UX execution or review, not every file that happens to mention the UI.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`, `docs/UX_FLOWS.md`, and `docs/PROJECT_STATE.md` are the critical live surfaces to compare against older UX plans.
- GitHub write access is still unavailable, so issue backfill must stay in the local GitHub-updates packet.

## Decisions

- Added `docs/agent/UI_UX_DOC_INVENTORY.md` as the Pass 7 inventory surface.
- Classified the current roadmap and audit rubric as active docs, `UX_FLOWS.md` and `PROJECT_STATE.md` as authority/current-truth docs, and the old `docs/ux/*` plus `docs/superpowers/*` plan/spec files as historical.
- Grouped the UI/UX implementation-note cluster as historical proof rather than listing every proof note separately.
- Identified the four main conflict sets to resolve in later docs-hygiene work: active roadmap versus older plans, final audit rubric versus older scorecard, roadmap versus `PROJECT_STATE`, and historical notes versus default context.

## Deviations

- I did not demote or archive any historical docs yet. That belongs to `#149` after the inventory exists.

## Tradeoffs

- The inventory is explicit enough to guide later cleanup, but still short enough to avoid becoming another competing master doc.
- Grouping the implementation-note cluster sacrifices item-by-item granularity, but that is the right tradeoff because the cluster should never be read as the active plan anyway.

## Files changed and why

- `docs/agent/UI_UX_DOC_INVENTORY.md`
  - Added the inventory, classifications, conflict set, and recommended keep/merge/archive actions.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#147`.
- `docs/implementation-notes/2026-06-08-ui-ux-doc-inventory.md`
  - Preserved the inventory decisions and boundaries for later doc-cleanup steps.

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

- The inventory is only useful if later issues actually demote the historical docs instead of leaving them quietly competing with the roadmap.
- `PROJECT_STATE.md` remains a live risk surface; without follow-through in `#150`, it can still drift back toward phase-diary behavior.

## Deferred items

- Demote or archive the historical plan/scorecard/spec docs in `#149`.
- Add explicit status headers in `#151`.
- Tighten UI context routing in `#152`.

## Rollback notes

- Revert the three files above only.
- Do not archive or rename any historical docs as part of rolling back this inventory issue.
