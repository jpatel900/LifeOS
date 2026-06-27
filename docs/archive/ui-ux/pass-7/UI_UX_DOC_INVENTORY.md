# UI UX Doc Inventory

Status: Active inventory for Pass 7 docs hygiene
Purpose: Inventory the UI/UX-related docs that can influence LifeOS implementation or review, classify their role, and identify conflicts or duplication
Read when: Executing docs-hygiene issues `#147` to `#153`
Do not use for: Product truth or execution order by itself; use it to classify docs, then follow the authoritative docs it points to
Superseded by: n/a during Pass 7; later demote or archive after docs-hygiene closeout if it is no longer needed

## Classification legend

- `authority`: governs current product or UX behavior
- `active`: current execution or audit control surface
- `reference`: useful support doc, but not the primary source of truth
- `historical`: keep for proof or background only
- `archive`: intentionally moved out of the live path; keep for proof or background only

## Inventory

| Path                                                                             | Class                   | Why it exists                                                                          | Default use                                                             | Conflict or duplication risk                                               | Recommended action                                                 |
| -------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/UX_FLOWS.md`                                                               | authority               | Defines the current workflow model and UX flow contracts                               | Read for route semantics and allowed UX behavior                        | Low                                                                        | Keep authoritative                                                 |
| `docs/UI_UX_WORLD_CLASS_ROADMAP.md`                                              | active                  | Canonical active UI/UX roadmap and proof-routing spine                                 | Read for active UX program state and pass order                         | High if other plans compete with it                                        | Keep as the single active UI/UX plan                               |
| `docs/PROJECT_STATE.md`                                                          | authority/current truth | Records shipped truth, recent work, and next recommended tasks                         | Read only when current shipped status or latest proof notes are needed  | High if it turns into a second roadmap or phase diary                      | Keep concise and factual; do not let it become the active plan     |
| `docs/agent/CONTEXT_INDEX.md`                                                    | reference               | Routes agents to the smallest useful context                                           | Read before broader repo exploration                                    | Medium if it points at stale UX docs                                       | Keep and tighten under `#152`                                      |
| `docs/agent/UI_PASS_7_EXECUTION_MAP.md`                                          | active                  | Shared Pass 7 control-plane supplement for dependency order, validation, and readiness | Read for Pass 7 execution gating                                        | Medium if it drifts from GitHub or the roadmap                             | Keep during Pass 7; reduce later if backfilled into GitHub         |
| `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`                                     | active                  | Canonical final-audit scoring standard for `#198` and `#199`                           | Read when auditing final UI/UX state                                    | Low                                                                        | Keep as the final audit standard                                   |
| `docs/agent/UI_PASS_7_LABEL_PLAN.md`                                             | reference               | Local metadata plan while GitHub write auth is unavailable                             | Read only when applying `#201` metadata later                           | Low                                                                        | Keep until GitHub labels and milestone are applied, then demote    |
| `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`                                         | reference               | Queue of exact GitHub comments or updates blocked by invalid auth                      | Read only when backfilling GitHub state                                 | Low                                                                        | Keep until GitHub write access is restored and updates are applied |
| `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`                                           | reference               | Redirect stub for an archived historical plan                                          | Read only when an older link still points here                          | Low after `#149`; the stub now exits the live path quickly                 | Keep as a redirect stub                                            |
| `docs/ux/LIFEOS_V1_UX_SCORECARD.md`                                              | reference               | Redirect stub for an archived historical scorecard                                     | Read only when an older link still points here                          | Low after `#149`; the stub now points to the active audit rubric           | Keep as a redirect stub                                            |
| `docs/superpowers/specs/2026-06-03-lifeos-ui-ux-modernization-design.md`         | reference               | Redirect stub for the archived modernization design precursor                          | Read only when an older link still points here                          | Low after `#149`; no longer a live-looking design brief in the active path | Keep as a redirect stub                                            |
| `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md` | reference               | Redirect stub for the archived modernization implementation plan                       | Read only when an older link still points here                          | Low after `#149`; no longer a live-looking implementation queue            | Keep as a redirect stub                                            |
| `docs/archive/ui-ux/*.md`                                                        | archive                 | Full historical UX plan, scorecard, design, and implementation content                 | Read only for background rationale, proof, or older-note verification   | Low if the archive stays clearly marked and out of the active path         | Keep archived                                                      |
| `docs/implementation-notes/*` for UI/UX work                                     | historical              | Proof trail for shipped UX decisions and route-level evidence                          | Read only when the roadmap or `PROJECT_STATE` points to a specific note | Medium if agents treat notes as default context instead of proof           | Keep as proof only; do not use as default context                  |

## Conflict set after `#149`

1. `docs/UI_UX_WORLD_CLASS_ROADMAP.md` versus the older plan documents
   - Former competing docs now redirect to the archive: `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`, `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md`
   - Remaining work: standardize clear status headers across the relevant live and historical docs in `#151`.

2. `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md` versus the older scorecard
   - The older scorecard now redirects to archive: `docs/ux/LIFEOS_V1_UX_SCORECARD.md`
   - Remaining work: keep the archive wording and later status-header pattern explicit enough that agents do not reopen the old gate accidentally.

3. `docs/PROJECT_STATE.md` versus the roadmap
   - Risk: `PROJECT_STATE` can absorb future-plan detail and become a second roadmap.
   - Resolution target: keep `PROJECT_STATE` as shipped truth and handoff context only.

4. implementation notes versus active planning docs
   - Risk: agents reconstruct the plan from old notes instead of the active roadmap.
   - Resolution target: route through the roadmap first, then only the latest linked note.

## Recommended keep / merge / archive actions

### Keep as live surfaces

- `docs/UX_FLOWS.md`
- `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- `docs/PROJECT_STATE.md`
- `docs/agent/CONTEXT_INDEX.md`
- `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
- `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`

### Keep as temporary Pass 7 control-plane support

- `docs/agent/UI_PASS_7_LABEL_PLAN.md`
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`

### Archived historical bundle

- `docs/archive/ui-ux/README.md`
- `docs/archive/ui-ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`
- `docs/archive/ui-ux/LIFEOS_V1_UX_SCORECARD.md`
- `docs/archive/ui-ux/2026-06-03-lifeos-ui-ux-modernization-design.md`
- `docs/archive/ui-ux/2026-06-03-lifeos-ui-ux-modernization-implementation.md`

### Keep as redirect stubs

- `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`
- `docs/ux/LIFEOS_V1_UX_SCORECARD.md`
- `docs/superpowers/specs/2026-06-03-lifeos-ui-ux-modernization-design.md`
- `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md`

### Keep as proof, not context

- UI/UX implementation notes under `docs/implementation-notes/`

## Bottom line

The main competition problem is now materially reduced. The remaining high-value cleanup work is:

- standardize status headers across the relevant UI/UX docs
- tighten the UI context route so future agents load the smallest live set first
- keep `PROJECT_STATE` from drifting back into a second roadmap
- keep implementation notes as proof only
