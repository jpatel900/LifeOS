# UI/UX Historical Archive Demotion

- Task name: `#149 Docs Hygiene 03 Archive or demote historical UI UX plans`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Archive or clearly demote the older UI/UX plans, scorecards, and modernization docs after the still-live rules have already been extracted into the active roadmap and current authority docs.

## Assumptions

- The old docs are still useful as proof and background, but their live-looking paths and titles make them too easy to mistake for the current execution queue.
- Breaking every old reference would be sloppy; redirect stubs are safer than hard moves with no compatibility surface.
- The active roadmap and current authority docs already carry the live rules that still matter.

## Decisions

- Created `docs/archive/ui-ux/` as the explicit historical bundle for the superseded UX plan, scorecard, design brief, and implementation plan.
- Copied the full original documents into that archive bundle.
- Replaced the old live-path files with short redirect stubs that explicitly say they are archived and point to the active roadmap, current authority docs, or archive copy.
- Updated the active roadmap and inventory so historical-input references point to the archive bundle, not the old live-looking files.

## Deviations

- I did not standardize every relevant UI/UX doc into one exact status-header format yet. That remains `#151`.
- I did not delete any historical content. The full text is preserved under `docs/archive/ui-ux/`.

## Tradeoffs

- The repo now carries both archive copies and redirect stubs, which is slightly redundant but much safer for old links and implementation-note references.
- This is intentionally structural rather than editorial. The goal is to stop context confusion, not to rewrite historical content.

## Files changed and why

- `docs/archive/ui-ux/README.md`
  - Added an explicit archive index and live replacement pointers.
- `docs/archive/ui-ux/*.md`
  - Preserved the full historical documents under a clearly archived path.
- `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`
  - Replaced with a redirect stub to the archive and active docs.
- `docs/ux/LIFEOS_V1_UX_SCORECARD.md`
  - Replaced with a redirect stub to the archive and the active final audit rubric.
- `docs/superpowers/specs/2026-06-03-lifeos-ui-ux-modernization-design.md`
  - Replaced with a redirect stub to the archive and active docs.
- `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md`
  - Replaced with a redirect stub to the archive and active docs.
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - Historical inputs now point to the archive bundle.
- `docs/agent/UI_UX_DOC_INVENTORY.md`
  - Updated the inventory to reflect the new archive bundle and redirect-stub state.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#149`.
- `docs/implementation-notes/2026-06-08-ui-ux-historical-archive-demotion.md`
  - Preserved the reasoning, scope, and proof for this archive pass.

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

- Some humans may prefer the full historical text at the old paths and find the redirect stubs mildly annoying.
- The archive bundle reduces confusion, but inconsistent header formats across the broader UI/UX doc set can still create drift until `#151`.

## Deferred items

- Standardize status headers across the relevant UI/UX docs in `#151`.
- Tighten the UI context route in `#152`.
- Add duplicate-active-plan guardrails in `#153`.

## Rollback notes

- Revert the redirect stubs, archive folder, roadmap/inventory updates, and this note together.
- Do not restore the old files in place without also removing the archive duplicates, or the repo will immediately regain the same ambiguity.
