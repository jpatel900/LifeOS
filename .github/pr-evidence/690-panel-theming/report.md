# Issue #690 evidence — Plan/Triage side panel to grammar + area-scoped screen accent

All evidence captured on the local dev server (mock/demo env, port 3210) via a
Playwright capture script (msedge channel, 1280x900, light+dark via
`localStorage.theme` + `colorScheme`). Token lines are `getComputedStyle` reads
of the moments-home root (`[data-testid="today-moments"]`) printed by the same
script that took each screenshot.

## Part 2 — screen accent takes the area color (before -> after)

Before (original code, captured from a stash of the pre-change tree):
every route/theme reads the fixed shell default, no inline override —

    home-area-main-job-dark   {"inline":null,"acc":"#6d8bff"}
    home-area-main-job-light  {"inline":null,"acc":"#6d8bff"}
    sheet-triage-dark/light   {"inline":null,"acc":"#6d8bff"}
    sheet-plan-dark/light     {"inline":null,"acc":"#6d8bff"}

After — the view-scope container carries the full `--acc` family, area-colored,
theme-derived (same `buildCockpitAccentStyle` the stage routes use):

    home-area-main-job-dark      --acc:#4c80cd --acc-sf:#253247 (dark surfaces)
    home-area-personal-dark      --acc:#439458
    home-area-volunteer-dark     --acc:#8965ba
    home-area-side-project-dark  --acc:#d87248
    home-area-main-job-light     --acc:#4c80cd --acc-sf:#e6edf8 (light surfaces)
    home-area-personal-light     --acc:#439458
    home-area-volunteer-light    --acc:#8965ba
    home-area-side-project-light --acc:#d87248

Screenshots: `before/` (6) and `after/` (12) in this directory — per area,
light+dark, plus the open Triage and Plan sheets in both themes.

## Part 1 — panel grammar (MomentSheet + TriageSheet/PlanSheet bodies)

Before: title `text-base` (1rem, off the fixed moments type tiers), `text-xs`
close control, no header staging, hardcoded `rounded-lg` rows, sheet grid
centered the "Open full view" link mid-panel (inline-flex stretched by the grid).
Header is `position:static/z-index:auto` — the `fixed inset-0 z-50` sheet
overlays it correctly, so the owner report is a grammar complaint, not z-order.

After: `.moments-card-title` header tier (1.5rem/620, the moments fixed scale),
hairline header divider (masthead grammar, #673 S1 precedent), `p-6/gap-5`
breathing room, `text-sm` close control (44px invisible hit target unchanged),
rows on `.moments-row` (`var(--surface-radius-sm)` + `--sf2/--ln` tokens),
link start-aligned. Presentation-only; TriageSheet behavior untouched.

## Contrast (WCAG 1.4.11 non-text 3:1, both themes)

`--acc` consumers on this surface are non-text accents (emphasis borders, rail
tints, schedule marks). Against dark `#1b1e25` / light `#ffffff`:

    Main Job  #4c80cd  4.19 / 3.98   PASS
    Personal  #439458  4.46 / 3.74   PASS
    Volunteer #8965ba  3.68 / 4.53   PASS
    Side Proj #d87248  5.10 / 3.27   PASS
    presets: Ocean 3.98, Forest 3.74, Clay 3.27, Violet 4.53, Teal 3.46 (light,
    all >=3:1); Sunrise #bd9121 = 2.90:1 vs white — see OWNER-GATE in the PR.

## Validation (literal tails)

detector (all 4 touched components): `[]` exit 0
vitest (threads pool, 6 suites incl. both accent precedent suites):
Test Files 6 passed (6)
Tests 89 passed (89)
turbo lint type-check: `Tasks: 16 successful, 16 total`
prettier: `All matched files use Prettier code style!`
