# Issue #690 — before-state evidence (computed tokens)

Captured on the running dev server (mock/demo env, port 3210) via getComputedStyle.
Pixel screenshots were blocked by the browser-pane renderer (screenshot/navigate
timed out on every route incl. a fresh tab; DOM reads + JS eval worked, page 200).
Computed CSS-variable snapshots are the token-driven-theming evidence in their place.

## Part 2 — area accent does NOT scope on the moments home

Moments home `/` (main.lifeos-cockpit.moments-home) — NO inline accent style:
--acc = #6d8bff (fixed .lifeos-cockpit default, NOT area color)
--acc-sf = #2b314a
--area-accent = oklch(0.67 0.174 270.2) (fixed brand default)

Stage route `/triage` (main.lifeos-cockpit, LifeOSCockpit) — inline style present:
style="--acc:#4c80cd;--acc2:#6994d5;--acc-sf:#253247;--acc-rng:#344f79;--on-acc:#ffffff"
--acc = #4c80cd (Ocean — first mock area color; area-scoped works here)

=> The stage cockpit themes --acc to the active area; the moments home does not.
#6d8bff (default) vs #4c80cd (area) on the same session proves the gap.

## Part 1 — right-side panel (MomentSheet) off the moments grammar

MomentSheet.tsx: title `text-base font-semibold` (1rem, off the fixed moments
type tiers), close control `text-xs`, hardcoded `p-5/gap-4`; TriageSheet rows use
`rounded-lg` (hardcoded) instead of the moments-row `var(--surface-radius-sm)`.
Header is position:static / z-index:auto — the `fixed inset-0 z-50` sheet overlays
it, so "below the design bar" is a grammar/hierarchy complaint, not a z-order defect.
