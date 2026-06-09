# UI Agent Guide

Status: Active UI context and review guide for LifeOS
Purpose: Tell agents how to load the smallest useful context for UI work and how to prove UI work before calling it done
Read when: Starting UI, shell, route-level, or UI-proof work, especially while Pass 7 is active
Do not use for: Shipped product truth, active roadmap status, or final audit scoring by itself
Superseded by: n/a; expand this guide in place rather than creating a competing UI guide

## Default read order

1. `AGENTS.md`
2. `docs/agent/CONTEXT_INDEX.md` or `pnpm agent:context ui`
3. `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
4. `docs/agent/UI_PASS_7_EXECUTION_MAP.md` while Pass 7 is active
5. `docs/PROJECT_STATE.md` only when current shipped truth, blockers, or next recommended tasks matter
6. the touched route source and its focused tests

## Load later only when needed

- `docs/agent/UI_INFORMATION_HIERARCHY_DOCTRINE.md` when copy, degraded states, diagnostics staging, or first-viewport hierarchy are in scope
- `docs/agent/UI_SEVERITY_VOCABULARY.md` when degraded states, blocked states, alert tone, or severity tests are in scope
- `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md` when auditing or preparing closeout proof
- `docs/implementation-notes/*.md` only when the roadmap or current route work points to a specific note
- `docs/archive/ui-ux/*.md` only when a roadmap or implementation note explicitly needs historical rationale

## Default UI proof surfaces

- `apps/web/src/__tests__/sourceOfTruth.test.ts`
- `apps/web/src/__tests__/routeSmoke.test.tsx`
- focused route tests under `apps/web/src/__tests__/`
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- `apps/web/tests/e2e/interaction-feedback.spec.ts`

## Review loop before marking UI work complete

1. Confirm the route still matches the active roadmap issue and did not broaden into adjacent cleanup.
2. Check the changed route at first viewport before reading lower-page details.
3. Prove the main behavior still works, not just the new copy or styling.
4. Run the required validation and focused tests for the touched surface.
5. Capture mobile and desktop proof for any first-scan or shell change.
6. State what stayed unchanged, especially around safety, external approval, read-only boundaries, and local fallback behavior.

## Behavior check

For any workflow-route UI change, verify these questions in code, tests, and rendered output:

- Is the next useful action visually dominant at first scan?
- Is safety truth visible before the user could misunderstand save, sync, or external-write behavior?
- Are diagnostics staged after action unless the route is blocked?
- Did developer detail stay out of the primary workflow surface?
- Did the route keep its contract:
  - `Home` stays read-only
  - `Capture` keeps raw-save recoverability and local fallback truth
  - `Planning` keeps Google approval gates explicit and unchanged
  - `Health` remains the diagnostic home instead of leaking subsystem noise into every route
  - `Areas` stays first-class but reads as supporting admin work in the overall workflow loop

## Screenshot proof

When UI hierarchy, shell, or first-viewport behavior changes, capture:

- mobile proof at `390px` width showing the first viewport at rest
- desktop proof showing the same route at rest
- additional screenshots only for materially different blocked, degraded, or approval-gated states

Use screenshots to prove hierarchy, not decoration. A valid screenshot should make it obvious:

- what the primary action is
- what safety truth is visible
- what moved into details or stayed secondary
- whether the route is calm or cluttered at first scan

If the issue changes only docs or tests, screenshots are not required unless the issue explicitly asks for browser proof.

## Test and command expectations

Default gate for UI docs or governance work:

- `git diff --check`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`

Add focused proof when the touched surface is runtime UI:

- relevant unit or route tests under `apps/web/src/__tests__/`
- relevant Playwright coverage under `apps/web/tests/e2e/`
- manual browser proof or screenshots when hierarchy, shell, or degraded-state behavior changed

Do not stop at green generic commands when a focused route test or browser surface is the real risk.

## Route proof notes

Before closing a UI issue or writing the handoff, record:

- which route or shell surface changed
- which tests prove the intended behavior
- which screenshots or browser checks prove the first-scan hierarchy
- which safety or truth boundaries were intentionally unchanged
- what got simpler, what moved into details, and what still remains noisy

If docs, tests, and rendered behavior disagree, rendered behavior and tests win until the docs are corrected. Do not mark the issue done on documentation optimism.

## Working rules

- Do not treat `docs/PROJECT_STATE.md` as the active implementation plan.
- Do not start from archived UX docs or older implementation notes by default.
- Route-level UI work should begin from the live roadmap and current route source, not from old polish notes.
- When a task touches external-write messaging, source-of-truth copy, or diagnostics staging, widen into the relevant tests before editing.
- Before creating any new UI/UX planning doc, first decide whether `docs/UI_UX_WORLD_CLASS_ROADMAP.md` should be amended instead.
- If the active roadmap is no longer fit, retire or archive it explicitly before introducing a replacement. Do not leave two active plan documents.
- Do not claim UI completion from code review or lint output alone. UI proof requires behavior checks plus the right tests and, when relevant, screenshot or browser evidence.
