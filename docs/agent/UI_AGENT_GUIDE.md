# UI Agent Guide

Status: Active UI context and proof guide for the LifeOS handoff cockpit pass
Purpose: Route UI agents through the new handoff cockpit source of truth without reviving old Pass 7 route contracts
Read when: Starting UI, shell, route-level, token, or browser-proof work
Do not use for: Shipped product truth or final runtime proof by itself
Superseded by: n/a

## Default Read Order

1. `AGENTS.md`
2. `docs/agent/CONTEXT_INDEX.md` or `pnpm agent:context ui`
3. `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
4. `design_handoff_lifeos/README.md`
5. `design_handoff_lifeos/tokens.css`
6. `design_handoff_lifeos/accent.js`
7. the touched cockpit source and focused tests
8. `docs/PROJECT_STATE.md` only when shipped truth, blockers, or next tasks matter

Open `design_handoff_lifeos/LifeOS Prototype.dc.html` with `support.js` when visual behavior is unclear. Treat `.dc.html` files as references, not production code to copy.

## Active UI Rules

- Handoff visuals supersede old route visual hierarchy contracts.
- Product safety docs still win for raw save, schemas, auth, RLS, and calendar approval.
- Use the app's own Next.js, shadcn-compatible primitives, and `WorkflowProvider`.
- Keep one cockpit shell and one routed stage body.
- Keep existing URLs as aliases into stages.
- Set every cockpit color through semantic CSS variables on the cockpit root.
- Port accent derivation exactly from the handoff.
- Dark is default; light is `data-theme="light"`.
- Keep admin/export/settings surfaces outside the cockpit unless explicitly scoped.

## Proof Surfaces

- `apps/web/src/__tests__/sourceOfTruth.test.ts`
- focused cockpit tests under `apps/web/src/__tests__/`
- focused Playwright coverage under `apps/web/tests/e2e/`
- screenshot/browser evidence under `apps/web/test-results/ui-handoff-cockpit/`

## Behavior Check

For every cockpit change, verify:

- Is there one obvious primary action?
- Is state said once?
- Are secondary details behind disclosure?
- Does area color improve scanning without becoming decoration?
- Is raw capture recoverable?
- Is Google writing still explicit and secondary?
- Does mobile stay usable at `390px`?
- Are dark and light both legible?

## Historical Docs

Old Pass 7 UI docs live under `docs/archive/ui-ux/pass-7/`. Read them only for historical rationale, never as active handoff implementation rules.
