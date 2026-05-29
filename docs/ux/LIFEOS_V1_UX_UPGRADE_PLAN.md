# LifeOS V1 UX Upgrade Plan

## Purpose

Define the next product-experience layer for LifeOS V1 so UI work lands against one coherent target instead of a series of disconnected polish passes.

This plan is intentionally practical. It is not a redesign manifesto.

## Product feel

LifeOS should feel like a calm daily cockpit, not an internal workflow console.

That means:

- one obvious next move per screen
- visible area, time, and uncertainty
- low-friction recovery when the user is interrupted, stuck, or behind
- plain-language status and outcome copy
- strong orientation without noisy chrome
- explicit approval before any external write

## Repo constraints

- `AGENTS.md` remains authoritative for UX behavior, scope control, and safety.
- `docs/UX_FLOWS.md` defines the current primary workflow model and requires area context to be visible everywhere.
- `README.md` confirms that mock/local fallback behavior is intentional and must not be deleted just to make the UI look cleaner.
- Existing routes remain stable unless a separate approved issue changes information architecture.
- Calendar writes remain explicit-approval only.
- Color is an orientation layer, not a truth substitute.

## Out of scope

- schema or migration work bundled into visual polish
- Google Calendar behavior changes
- auth, RLS, parser, observability, env, or deployment changes
- a full theme builder
- new vendors, animation frameworks, or styling dependencies
- a broad route or information-architecture rewrite
- hiding degraded-state truth behind pretty copy

## Information architecture recommendation

Keep the current route structure and six primary workflow screens intact for V1.

Recommended product framing:

- `/` as `Today`
- `/capture` as `Capture`
- `/triage` as `Triage` now, with later review for a lighter label only if docs and route smoke remain aligned
- `/calendar` as `Calendar / Planning`
- `/execute` as `Focus`
- `/review` as `Review`
- `/health` as `Health`
- `/settings/areas` as secondary `Areas`

The immediate goal is better user-facing orientation and hierarchy, not route churn.

## Area accent principles

Area accent exists to reduce context-switching load.

Rules:

- accent should be visible quickly and disappear into the background once noticed
- color must never be the only area signal
- area name remains visible in the shell and on area-relevant cards
- icon/chip/text should still identify the area when color perception is limited
- accent strength should increase near active work and decrease on secondary/supporting surfaces
- unknown or unselected area uses a neutral fallback

## Area accent token vocabulary

Use a small stable token set:

- `--area-accent`
- `--area-accent-soft`
- `--area-accent-muted`
- `--area-accent-border`
- `--area-accent-ring`
- `--area-accent-foreground`
- `--area-accent-surface`

Intent:

- `accent`: the main identity color
- `soft` and `surface`: subtle fills and panel backgrounds
- `muted`: chips, dots, and subdued highlights
- `border`: card edges, dividers, and active nav hints
- `ring`: focus-visible and active-control emphasis
- `foreground`: readable text/icon color when accent backgrounds are used

## Default palette direction

Keep the palette small, dark-mode-safe, and stable:

- Main Job: blue/cyan family
- Personal: violet/indigo family
- Volunteer Work: emerald/green family
- Side Project: amber/orange family
- unknown/custom/fallback: slate/neutral family

This is not a user-theme system. It is an orientation vocabulary.

## Visual hierarchy rules

- Every screen should answer one question first.
- The dominant panel should be obvious within the first viewport.
- Supporting panels should visually step back.
- Diagnostics belong behind quieter affordances when not essential to the main task.
- Empty states should show one useful next move, not multiple equally weighted recovery paths.
- Avoid large stacks of same-weight bordered cards.

## Button hierarchy rules

- One primary action per decision point.
- Secondary actions should remain available but quieter.
- Destructive actions should be unmistakable and rare.
- Disabled controls should either be hidden or accompanied by a plain nearby reason.
- Do not present fake affordances for actions the app cannot currently complete.

## Card and empty-state rules

- Current work and next work should not look interchangeable.
- Active or recommended items can carry stronger contrast, accent, or spacing.
- Secondary lists should use quieter surfaces and lower visual density.
- Empty states should reduce anxiety and point to one small next step.
- Avoid empty cards that exist only to say nothing is happening.

## Interaction feedback rules

- After an action, the user should know what happened, where the item went, and what to do next.
- Prefer existing inline status or local feedback patterns before adding broader notification systems.
- Do not claim undo exists unless it is real.
- Feedback copy should avoid internal implementation language.
- Important feedback should be perceivable without relying on color alone.

## Lifecycle and lane clarity rules

- State labels should stay consistent across Capture, Triage, Planning, Focus, and Review.
- Cross-screen chips should describe workflow state, not storage implementation.
- Repeated cards on a screen should look intentionally different by role or status, not duplicated by accident.
- Current-item queues should emphasize the present decision and show what is up next without equal-weight expansion.

## Accessibility constraints

- color is never the only area signal
- focus-visible states must remain obvious
- contrast must stay readable in dark mode and narrow/mobile layouts
- primary actions should remain reachable by keyboard
- important status feedback should use appropriate status semantics where practical
- accent treatment must not make active text, chips, or states harder to read

## Screen-level goals

### Today

- feel like a daily command center
- keep one dominant next move near the top
- make selected area obvious
- suppress empty/supporting sections that compete with the main action

### Capture

- preserve fast capture
- make save vs structure outcomes immediately understandable
- keep recent captures supportive, not dominant

### Triage

- behave like a present-tense decision queue
- show one current decision clearly
- make accept, edit, reject, and defer paths obvious

### Calendar / Planning

- separate local planning from Google actions
- keep Google write surfaces secondary and explicit
- make proposal state readable without leaking implementation jargon

### Focus

- feel like the strongest execution surface
- show one mission, one state, one next move
- keep recovery actions calm and non-shaming

### Review

- lead with close-the-loop summaries and carry-forward decisions
- keep detail and diagnostics secondary

### Areas

- act like a real workspace control surface
- make selected area, counts, and routing actions useful
- keep slugs and internals out of the primary card surface

### Health / Settings

- answer reliability questions before raw diagnostics
- keep admin/system details available without dominating daily workflow use

## Sequencing

Recommended order:

1. UX plan and scorecard
2. area accent tokens and default palette
3. shell-level area accent
4. area accent on core workflow cards
5. area color editing if persistence already exists safely
6. visual hierarchy pass
7. interaction feedback pass
8. Focus flagship polish
9. mobile/accessibility/keyboard smoke pass
10. nav label review only after the preceding work clarifies the intended product voice

## PR completion checklist

Use this before calling a UX issue done:

- the change still obeys `AGENTS.md` and `docs/UX_FLOWS.md`
- one obvious next move is clearer than before
- area remains visible textually and not just through color
- no hidden external write behavior was introduced
- no fallback/mock path was removed just to improve appearance
- changed screens avoid equal-weight clutter
- empty states point to one useful next move
- feedback copy avoids implementation jargon
- mobile/narrow layout stayed usable
- keyboard/focus treatment stayed obvious
- relevant route/component/browser checks were run

## Decision note for future issues

If a proposed UX change requires route churn, schema work, calendar behavior changes, or reclassification of a primary workflow screen, stop and split that into a separate issue instead of rationalizing it into a polish PR.
