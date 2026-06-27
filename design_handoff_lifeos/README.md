# Handoff: LifeOS — calm, glanceable workflow cockpit

## Overview

LifeOS is a personal GTD-style cockpit: a thought flows **Capture → Triage → Plan → Execute → Review**, with **Health** as a system check and an **All areas** cross-cutting overview. This redesign keeps every existing feature but cuts cognitive load: one primary action per screen, progressive disclosure, state said once, quiet chrome. The guiding bar is **glanceability** — meaning should land pre-cognitively (size-by-load bars, color-by-area cards, count-bearing nav, progress rings), not after reading.

## About the design files

The files in this bundle are **design references created in HTML** (`.dc.html`) — prototypes showing intended look and behavior, **not production code to copy**. Your task is to **recreate these designs in the target codebase's environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, component library, and state store. If no environment exists yet, pick the most appropriate framework and implement there. Open a `.dc.html` file directly in a browser to see it run (keep `support.js` alongside).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, interactions. Recreate pixel-accurately using your codebase's libraries. All exact values are in `tokens.css` / `tokens.json`; accent math in `accent.js`.

---

## Architecture (build this way)

1. **Token-driven.** Every color is a semantic CSS variable on the app root. The theme toggle swaps the **base ramp**; the active area swaps the **accent**. Nothing downstream hardcodes a hex.
2. **Dark is the default**; light is a user toggle (`data-theme="light"`).
3. **Accent is derived, not stored.** Each area persists one base hex; all variants (`acc2`, `acc-sf`, `acc-rng`, `on-acc`) are computed at render via `accent.js` so any custom area color stays legible in both themes.
4. **One screen component, view router.** A single container renders the active view from a `stage` enum. The pipeline spine is both navigation and a live workload gauge. Do not duplicate per-page layout — that was the original defect.

---

## Design tokens

See **`tokens.css`** (`:root` dark default + `[data-theme="light"]`) and **`tokens.json`** (machine-readable, incl. status colors, palette, derivation formulas, type & layout). Summary:

- **Base ramp** (theme-dependent): `--bd --sf --sf2 --sf3` surfaces; `--ink --mut --fnt` text; `--ln --ln2` borders; `--btn/--btn-fg` neutral button; `--track` ring track.
- **Status (fixed semantic)**: `--amb-*` triage, `--blu-*` plan/someday, `--grn-*` done/healthy — each `fg / sf / ring`.
- **Accent (per-area, derived)**: `--acc` base; `--acc2` inner/bar fill; `--acc-sf` tint bg/active chip; `--acc-rng` tinted-block border; `--on-acc` text on solid accent.
- **Type**: Hanken Grotesk (UI, 400–800); IBM Plex Mono (clocks, counts, kicker labels, est/when).
- **Layout**: container `--max` 1000px web / 412px mobile, radius 22px. Plan / Review / All-areas grids collapse to one column on mobile.

### Derivation (mirror exactly — `accent.js`)

```
acc2    = mix(acc, dark ? '#fff' : '#000', 0.16)
acc-sf  = mix(acc, sf2, dark ? 0.80 : 0.86)
acc-rng = mix(acc, sf2, dark ? 0.50 : 0.66)
on-acc  = lum(acc) > 0.55 ? '#1a1a14' : '#fff'
cardBg  = mix(areaColor, sf2, dark ? 0.83 : 0.88)   // overview cards
ring: r=104 focus / r=86 review; dash=2·π·r; offset=dash·(1 − value/total)
band.flex = max(1, count) + 0.6                      // Today glance + spectrum
```

---

## Data model

```
Area    { name: string, color: hex }                 // one base hex; accents derived
Item    { id, text, area, status, est?, when? }      // area = index into areas[]
                                                      // status: inbox|today|planned|done
                                                      // est = minutes; when = hour 8–18
Session { id, text, outcome, planned, actual }        // outcome: complete|stuck|missed

App state {
  stage: today|capture|triage|plan|execute|review|health|overview,
  dark: bool,  view: web|mobile,
  areas: Area[],  areaIndex: int,
  items: Item[],  sessions: Session[],
  selecting: id|null,                                 // task awaiting a Plan time slot
  activeId, running, remaining, total, ending         // focus session, seconds
}
```

**Status lifecycle:** `inbox` → triage decides → `today` (do) / `later` (someday) / removed (drop). `today` → assign `when` → `planned`. `planned` → run session → `done` on complete; _stuck/missed_ log a Session but leave status.

**Scoping:** all six pipeline screens show only the active area's items (`item.area === areaIndex`); new captures inherit `areaIndex`. The **All areas** view ignores the filter; spine counts stay area-scoped.

---

## Screens & interactions

**Persistent chrome**

- **Header:** logo · `All areas` chip + area chips (each a color dot; active uses `--acc-sf`/`--acc`) · `+` add-area · accent swatch (opens palette to recolor active area) · Web/Mobile segmented · theme toggle.
- **Spine:** 6 nodes (Today, Capture, Triage, Plan, Execute, Review) on a hairline rail. Each node circle shows the stage's live count and tone; active node inverts with an `--acc-sf` halo. Tap to navigate.

**Today** (`stage: today`) — Two elements. _One move now_: a single card whose content tracks the heaviest unmet stage (inbox→Triage, else today→Plan, else planned→Focus first block, else caught-up). _At a glance_: a 4-band bar (to triage / to plan / scheduled / done); each band width = `max(1,count)+0.6`, colored by stage tone. Bands + CTA navigate.

**Capture** (`stage: capture`) — Centered borderless textarea (caret `--acc`), one **Save thought** button, `⌘↵`. On save: push `inbox` item in active area, clear, flash green "waiting in Triage" toast (~1.4s). Area picker / save-mode / drafts intentionally hidden behind `/`.

**Triage** (`stage: triage`) — One card at a time (first inbox item) + remaining-dots row. Three directional targets: **Drop** (remove), **Someday** (→later), **Do today** (→today, accent-filled). Next card slides up. Empty → "Inbox clear" + Plan CTA.

**Plan** (`stage: plan`) — Two-pane: hour rail 8am–6pm + "To place" list. Tap a task → `selecting`; empty hours show "drop here" with `--acc` tint; tap an hour → item becomes `planned` with that `when`. Tap a placed block to unplan. All placed → "Start focusing" CTA. Mobile: panes stack.

**Execute** (`stage: execute`) — Picker lists planned blocks (time chip + est). Choosing starts a session (`total = est×60`). Countdown **ring** (r=104) depletes; one Start/Pause/Resume + End session. At zero or End → outcome step (Complete→done, Stuck, Missed); all log a Session with planned vs actual minutes.

**Review** (`stage: review`) — Verdict-first: completion **ring** (done/total) + headline ("day closed clean" vs "N carry over"). Below: planned-vs-actual focus bars (from sessions) + outcome pills. Lead with the answer; counts support it.

**Health** (`stage: health`) — Single green status ring + "All systems healthy · 11/11". Three grouped summary tiles (Storage, Integrations, Telemetry-off) instead of 11 cards. "Run system check" pulses the ring ~1.4s. Full breakdown one tap away.

**All areas** (`stage: overview`) — Cross-area mission control. _Workload spectrum_: one bar split by area color, segment width = area's open count / total. _Legend_: per-area open counts. _Pipeline board_: 4 columns (To triage / To plan / Scheduled / Done) holding every item from every area; each card tinted `mix(areaColor, --sf2)` with a 3px area-color left edge + labeled area dot. Mobile: columns stack.

---

## Interactions & behavior

- **Theme toggle:** swaps base ramp only; accents re-derive against the new `sf2`. Animate surface/border color ~0.25s.
- **Area switch:** sets `areaIndex`, re-derives accent, refilters all pipeline screens. From overview, selecting an area drops you into its Today.
- **Add area:** `+` reveals an inline input; Enter commits with the next palette color (cycles), selects it. Escape cancels.
- **Customize accent:** swatch button opens an 8-color palette popover; pick recolors the active area everywhere instantly.
- **Animations:** card slide-up ~0.35s; toast pop ~0.4s; health pulse ~1s; ring updates per-second tick.
- **Responsive:** single component; `--max` + grid tokens switch at the web/mobile boundary. Hit targets ≥44px on mobile.

## State management

State variables above. Persist `areas`, `items`, `sessions`, `dark`, `areaIndex`. The session timer is the only wall-clock dependency. The prototype holds state in memory — swap in your store without touching the view layer.

## Assets

No raster assets. Icons are Unicode glyphs (◆ ↘ ◷ ▶ ✓ ✕ → ◐ ○ ☀ ☾) — replace with your icon set. Fonts: Hanken Grotesk + IBM Plex Mono (Google Fonts) — substitute with your stack if preferred, keeping a grotesk UI face + a monospace for numerals.

## Files in this bundle

- `LifeOS Prototype.dc.html` — the interactive reference (all 8 views, theming, areas). **Primary source of truth.**
- `LifeOS Handoff Spec.dc.html` — the same spec as a printable one-pager.
- `LifeOS Review.dc.html` — the UX critique behind the redesign (rationale / before-afters).
- `tokens.css`, `tokens.json`, `accent.js` — paste-ready tokens + derivation util.
- `support.js` — runtime for opening the `.dc.html` files in a browser (reference only; not for production).
