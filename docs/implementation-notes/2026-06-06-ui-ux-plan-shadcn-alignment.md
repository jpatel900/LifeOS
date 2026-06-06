# 2026-06-06 UI/UX Plan Shadcn Alignment

## Scope

Align the repo's UI/UX planning surfaces with the shipped frontend-governance and shadcn-consistency direction.

This was a docs-only planning pass. No runtime code changed.

## Why

The repo already had the right runtime and governance direction:

- shared primitives and repeated interaction patterns should flow through the app-local shadcn-compatible layer
- route composition, shell identity, and product authorship should remain custom

But parts of the older UX planning stack still read like the primitive/disclosure/loading cleanup was an open modernization stream rather than a completed foundation rule.

That would cause future agents to waste time re-solving a seam that is already closed.

## What changed

- Updated `docs/UI_UX_WORLD_CLASS_ROADMAP.md` to:
  - mark the primitive/disclosure/loading cleanup as complete maintenance infrastructure
  - require future passes to reuse the shared primitive layer instead of reopening route-local one-offs
  - include the frontend shadcn-governance note in the proof chain
- Updated `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md` to:
  - mark it as historical planning input
  - describe the current frontend system split explicitly
  - note that the shared primitive foundation and repeated-seam cleanup are already landed
- Updated `docs/ux/LIFEOS_V1_UX_SCORECARD.md` to:
  - add a frontend-system alignment check for repeated controls, disclosures, loading states, and form structure
- Updated `docs/superpowers/specs/2026-06-03-lifeos-ui-ux-modernization-design.md` to:
  - mark it as a historical precursor
  - record the primitive-layer/custom-composition split
  - point future execution back to the active roadmap
- Updated `docs/superpowers/plans/2026-06-03-lifeos-ui-ux-modernization-implementation.md` to:
  - mark it as historical implementation input
  - note that the shared primitive/disclosure/loading layer is already landed
  - direct future work toward the current roadmap and existing app-local primitive layer

## Result

The repo's UX planning stack now says one coherent thing:

- active roadmap drives current execution
- app-local shadcn-compatible primitives are the shared frontend foundation
- primitive cleanup is complete at the route level
- future UX work should extend that foundation, not relitigate it

## Validation

- `git diff --check`

## Notes

- This alignment is governance only. It should not be presented as a shipped UX/runtime change.
