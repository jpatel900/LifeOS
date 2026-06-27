# LifeOS — agent build guide

You are implementing the LifeOS UI in this repository. **Read `README.md` first** — it is the self-sufficient spec. Use `tokens.css` / `tokens.json` for exact values and `accent.js` for color derivation. The `LifeOS Prototype.dc.html` is the visual source of truth (open in a browser with `support.js` alongside).

## Non-negotiables
- **Recreate the designs in this codebase's environment** (its framework, component library, state store). The bundled `.dc.html` files are references, not code to copy.
- **Token-driven.** Every color is a semantic variable on the app root. Never hardcode a hex in a component.
- **Dark is the default theme.** Light is a toggle via `data-theme="light"`.
- **Accent is derived per active area**, not stored. Use `accent.js` exactly — `on-acc` guards text contrast so custom area colors never become illegible.
- **One screen component + `stage` router.** Do not duplicate per-page layout.

## Design intent (don't regress)
The redesign exists to cut cognitive load. Hold the line:
- One primary action per screen; secondary actions look secondary.
- Progressive disclosure — history/drafts/settings appear on demand, not by default.
- Say state once (active area lives in the header; don't restate it in-body).
- Glanceable: prefer size-by-load bars, color-by-area cards, count-bearing nav, and progress rings over text-first cards.

## Workflow
1. Read `README.md` end to end. 2. Wire tokens (`tokens.css`) + `accent.js`. 3. Build the shell (header + spine + `stage` router). 4. Implement views in pipeline order: Today, Capture, Triage, Plan, Execute, Review, Health, All areas. 5. Verify dark+light and web+mobile for each. Persist `areas`, `items`, `sessions`, `dark`, `areaIndex`.
