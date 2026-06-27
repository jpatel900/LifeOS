# UI/UX World-Class Roadmap

Status: Active UI/UX roadmap for the LifeOS handoff cockpit pass
Purpose: Define the live UX program, visual authority, proof routing, and closeout bar for the handoff cockpit implementation
Read when: Starting, implementing, reviewing, or auditing UI/UX work
Do not use for: Shipped product truth or runtime proof by itself
Superseded by: n/a

This file is the single active UI/UX plan for LifeOS.

## Active Pass

### Handoff Cockpit Pass

The `design_handoff_lifeos/` bundle is the visual source of truth for workflow routes. It supersedes prior route visual hierarchy contracts, but it does not supersede LifeOS product safety, schema, RLS, raw-capture, auth, or calendar-write approval rules.

Build the cockpit as:

- token-driven visuals from `design_handoff_lifeos/tokens.css` and `tokens.json`
- exact accent derivation from `design_handoff_lifeos/accent.js`
- dark default with light via `data-theme="light"` on the cockpit root
- one screen component plus a stage router
- thin route aliases for existing URLs
- one primary action per screen
- progressive disclosure for secondary/admin/detail content
- count-bearing spine, area-colored cards, size-by-load bars, and progress rings

## Required Implementation Order

1. Branch and inventory local changes.
2. Archive or retire old UI visual-contract docs.
3. Add the minimal data/status groundwork the handoff needs.
4. Add handoff tokens, accent derivation, and cockpit preferences.
5. Build the cockpit shell, stage router, and route aliases.
6. Build Today, Capture, Triage, Plan, Execute, Review, Health, and All areas.
7. Replace old UI tests with handoff-focused contracts.
8. Capture dark/light and desktop/mobile evidence before closeout.

## Active Route Contract

Existing URLs remain stable:

- `/` renders `today`
- `/capture` renders `capture`
- `/triage` renders `triage`
- `/calendar` renders `plan`
- `/execute` renders `execute`
- `/review` renders `review`
- `/health` renders `health`

All workflow routes share the same cockpit shell and stage body. Do not duplicate per-page layout.

`All areas` is a global cockpit overview. Area administration remains outside the cockpit under settings.

## Safety Boundaries

- Capture must persist raw input before any parse or organize behavior.
- Google Calendar writes remain secondary and approval-gated.
- Health remains truthful and rule-based.
- Account/local/provider truth appears near relevant actions, not as loud global clutter.
- Prototype copy may be shortened or adjusted to satisfy LifeOS truthfulness rules.

## Proof Contract

Default closeout gate:

- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`

Add focused proof for this pass:

- schema/status tests for `backlog`
- static guard for no component hardcoded hex colors
- static guard that route files stay thin aliases into the cockpit
- route/component tests for raw-save, triage, planning approval disclosure, execution outcome, review, health, and overview
- browser proof for all eight cockpit stages in dark and light at desktop and mobile widths

Evidence for this pass belongs under `apps/web/test-results/handoff-cockpit/`.

## Historical UI Docs

Prior Pass 7 docs are historical proof only. They are archived under `docs/archive/ui-ux/pass-7/` and must not be treated as active visual contracts for the handoff cockpit.

`docs/implementation-notes/*.md` remain dated evidence and should not be used as a competing active UI queue.
