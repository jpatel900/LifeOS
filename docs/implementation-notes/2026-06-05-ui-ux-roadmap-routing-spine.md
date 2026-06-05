# UI/UX roadmap and routing spine

## Task name and branch

- Task: durable world-class UX roadmap and fresh-agent routing spine
- Branch: current working branch

## Original scope

- add one canonical UI/UX roadmap
- route fresh `ui` agent context through roadmap -> shipped state -> latest proof note
- keep `PROJECT_STATE` as shipped truth only
- record the docs/tooling pass in one implementation note

## Assumptions

- The prior June UX passes are already shipped truth and should be reflected as completed or partial program progress, not re-planned from scratch.
- This pass is docs/tooling only and should not change runtime behavior, tests, schemas, auth, parser boundaries, or Google Calendar behavior.

## Decisions

- Added `docs/UI_UX_WORLD_CLASS_ROADMAP.md` as the single canonical active UX program document.
- Kept `docs/PROJECT_STATE.md` as shipped truth and added only one concise docs/tooling bullet.
- Routed `ui` agent orientation through the roadmap first by updating `docs/agent/CONTEXT_INDEX.md` and the `ui` entry in `docs/agent/REPO_MAP.json`.
- Treated the older `docs/ux/*` plan and scorecard as historical inputs only instead of expanding the routing tree to multiple planning docs.
- Marked the durable planning spine and the earlier clarity gate as `done`, and set visual authorship as the single active next pass.

## Deviations

- Did not rewrite or delete the older `docs/ux/*` files in this pass. That would have been cleanup for cleanup's sake. The new routing layer makes them non-canonical without creating more churn.
- Did not claim exact browser-audited world-class scores. The roadmap scorecard is framed as current contract-level expectations that must still be re-counted during future browser passes.

## Tradeoffs

- The route scorecard includes concise contract-level counts and posture rather than exhaustive per-screen inventories. That keeps the roadmap usable instead of turning it into a second `PROJECT_STATE`.
- The roadmap is opinionated about one active pass at a time. That is deliberate. The recent UX work already proved that broad simultaneous polish creates drift.

## Files changed and why

- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
  - new canonical UX roadmap with fresh-run protocol, route scorecard, pass queue, proof contract, and next pass
- `docs/agent/CONTEXT_INDEX.md`
  - makes `ui` routing explicitly point to roadmap -> `PROJECT_STATE` -> latest proof note
- `docs/agent/REPO_MAP.json`
  - updates `pnpm agent:context ui` output so fresh agents see the roadmap and the current proof surfaces first
- `docs/PROJECT_STATE.md`
  - records the new docs/tooling layer as shipped repo process truth
- `docs/implementation-notes/2026-06-05-ui-ux-roadmap-routing-spine.md`
  - durable record for this pass

## Validation commands and results

- `pnpm agent:context ui`
  - passed; output now reads roadmap -> `PROJECT_STATE` -> latest proof note before code paths
- `pnpm exec prettier --check docs/UI_UX_WORLD_CLASS_ROADMAP.md docs/agent/CONTEXT_INDEX.md docs/agent/REPO_MAP.json docs/PROJECT_STATE.md docs/implementation-notes/2026-06-05-ui-ux-roadmap-routing-spine.md`
  - passed
- `git diff --check`
  - passed with no whitespace errors; Git emitted existing LF->CRLF working-copy warnings on tracked docs
- `git status --short`
  - passed; only the intended roadmap, routing, and implementation-note files are modified or new

## Risks

- Low. The only real risk is documentation drift if future UX passes update code/tests but skip the roadmap or `PROJECT_STATE`.

## Deferred items

- Optional later cleanup: add short “historical only” banners to `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md` and `docs/ux/LIFEOS_V1_UX_SCORECARD.md` if they start confusing future runs again.

## Rollback notes

- Revert `docs/UI_UX_WORLD_CLASS_ROADMAP.md`, `docs/agent/CONTEXT_INDEX.md`, `docs/agent/REPO_MAP.json`, `docs/PROJECT_STATE.md`, and this note together.
- No runtime rollback is needed because no app behavior changed.
