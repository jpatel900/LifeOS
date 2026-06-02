# UX IA and scope decisions for issues #126, #127, #129, and #130

## Issue #126: Settings IA split

### Decision

Keep one V1 settings route for now and split it visually, not structurally.

### Why

- `docs/UX_FLOWS.md` already treats Settings as secondary/admin rather than part of the six primary workflow screens.
- The current runtime surface is still `"/settings/areas"`, and adding `"/settings/integrations"` or `"/settings/data"` now would create extra route, smoke, and OAuth-adjacent surface area for limited product gain.
- The actual problem is not missing routes. It is that one route currently mixes three concerns without enough visual separation.

### Recommended V1 IA

- Keep `"/settings/areas"` as the single route for this phase.
- Split the route into three explicit sections in this order:
  1. `Area management`
  2. `Integrations`
  3. `Local data`

### What belongs where

- `Area management`
  - create area
  - area cards
  - accent color editing
  - area-level routing actions
- `Integrations`
  - Google Calendar connection state
  - connect/disconnect controls
  - any future secondary integration status copy
- `Local data`
  - reset-this-browser controls
  - device-only storage explanation

### Route decision

- Do not create new settings routes yet.
- Revisit dedicated routes only if at least one of these becomes true:
  - another integration is added
  - policy settings become real runtime surfaces
  - AppShell needs an explicit `Settings` or `More` grouping

### Test impact

- Current settings smoke can remain route-based on `"/settings/areas"`.
- A later implementation pass should update route tests and Playwright expectations only for section headings and CTA placement, not for auth or Google behavior.

## Issue #127: Canonical V1 navigation labels

### Decision

Adopt this V1 user-facing label map in docs first, then change runtime only in a later narrow pass if still desired:

- `/` -> `Today`
- `/capture` -> `Capture`
- `/triage` -> `Triage`
- `/calendar` -> `Planning`
- `/execute` -> `Execute`
- `/review` -> `Review`
- `/health` -> `Health`
- `/settings/areas` -> `Areas` as a secondary/admin destination, not a seventh primary workflow screen

### Why

- `docs/UX_FLOWS.md` is still the authority document and must be updated before any broader runtime rename pass.
- The current runtime is already mixed (`Today`, `Planning`, `Execute`, `Areas`), but the repo does not have enough doc authority yet for another rename wave.
- `Triage` should stay for V1. `Decide` is lighter, but it is still a product-language experiment, not an approved canonical label.
- `Execute` should also stay for V1. `Focus` is a plausible future label, but the current docs still define the route as `Execute`.

### Required next step if runtime renames are reopened

1. Update `docs/UX_FLOWS.md` first.
2. Then make one narrow runtime pass across AppShell labels, route headings, copy references, and smoke tests.

## Issue #129: First-run setup path

### Decision

Do not add a wizard. Use Today plus Areas as the first-run path.

### Why

- `docs/UX_FLOWS.md` already frames setup as short and low-ceremony.
- LifeOS is a personal cockpit, not a SaaS onboarding funnel.
- The repo already has the needed surfaces: `Today`, `Areas`, `Capture`, and optional Google Calendar connection on the settings route.

### Trigger definition

Treat first-run as two states:

- `needs_area_setup`
  - signed-in user has no active persisted areas, or local/device state has no active areas
- `needs_first_workflow_action`
  - user has areas, but no captures, no accepted tasks, no planned blocks, and no review history worth surfacing

### Recommended flow

1. Land on `Today`.
2. If there are no active areas, show a dominant CTA to `Set up areas`.
3. If areas exist but there is no workflow history yet, show a short setup checklist on `Today`:
   - confirm or create an area
   - optionally choose area accents
   - optionally connect Google Calendar
   - capture one real thought
4. After setup or skip, keep the next dominant action on `Capture`.

### Mandatory vs optional

- Mandatory
  - at least one active area
- Optional
  - accent color edits
  - Google Calendar connection

### Skip and recovery

- User must be able to skip optional setup without penalty.
- `Today` should keep pointing to the next concrete step.
- `Areas` remains the recovery path for area and integration setup later.

### Test impact

- Add Today empty-state coverage for:
  - no areas
  - areas exist but no workflow state
- Add route smoke for the `Set up areas` and `Capture first thought` CTA paths if implementation follows.

### Later implementation slices

- Today empty-state branching for first-run states
- Areas route section wording aligned with setup guidance
- Optional Google Calendar setup copy refinement only, with no OAuth behavior change

## Issue #130: Selected-area semantics across routes

### Current code truth

- `Today`
  - selected area is orientation and accent only
  - data is effectively all-area
  - home quick capture uses the selected area as the default assignment context
- `Capture`
  - selected area is the default assignment for saves
  - the visible local recent-capture list is filtered by selected area
  - this does not automatically mean persisted capture history is filtered the same way
- `Triage`
  - queue is all pending drafts
  - selected area is not a true queue filter
- `Planning`
  - local/mock mode filters tasks, proposals, and blocks by selected area
  - persisted mode currently does not apply the same selected-area filter
- `Execute`
  - selected area is orientation/fallback only
  - active mission is driven by the running task or block, not by an all-items area filter
- `Review`
  - route is an all-area review surface with per-area summaries
  - selected area is accent/orientation only
- `Areas`
  - management surface, not a filter

### Decision

For V1, the selected area should be treated as an orientation layer plus a default assignment context, not as a hidden global filter.

### Required corrections

- Do not silently imply that tinted or accented UI means the whole route is filtered.
- Where a route is all-area, the copy should say so plainly.
- Where a route is partially filtered today, the copy must describe the actual scope instead of pretending the behavior is uniform.

### Smallest safe follow-up

- `Today`: keep `Current area` wording, but do not imply the cockpit itself is area-filtered.
- `Capture`: clarify the split between selected-area save assignment and whatever history source is actually shown.
- `Triage`: explicitly frame the route as the current all-area decision queue.
- `Planning`: resolve the local-vs-persisted inconsistency before adding stronger area-scope wording.
- `Review`: keep all-area framing and use selected area only as orientation unless an explicit route-level filter is added later.

### What not to do

- Do not add silent area filtering in persisted routes just because the accent looks strong.
- Do not call the selected area a `scope` unless the route truly scopes data that way.
- Do not treat color/accent as proof of filtering.

### Best next implementation target

Issue `#123` is the right first runtime follow-up because Capture already exposes the clearest source-of-truth mismatch between selected-area context and visible history.
