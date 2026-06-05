# 2026-06-04 Home and Execute IA Reduction Pass

## Scope

This pass stayed inside the current Home and Execute routes plus their existing proof surfaces:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/execute/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/__tests__/page.test.tsx`
- `apps/web/src/__tests__/executeFocusPolish.test.tsx`

Browser proof used the existing P0, hierarchy, and interaction-feedback suites:

- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- `apps/web/tests/e2e/interaction-feedback.spec.ts`

No route names, persistence boundaries, auth flow, parser contracts, or Google Calendar approval rules changed.

## What changed

- Added quieter shared progressive-disclosure primitives in `globals.css` for inline details and compact preview lists.
- Home still keeps one visible support card plus a higher-level overflow disclosure, but support cards now also preview only the first items and tuck the rest behind calmer inline disclosures.
- Home now moves extra starter-route choices behind one quieter `Other routes` disclosure instead of showing every path at once in the empty loop state.
- Home now moves `Suggested follow-through` behind one reveal instead of rendering every supporting step as always-visible chips.
- Execute now frames `First tiny step` inside a tighter action tray and moves the more explanatory `Next recommended action` / persisted-stop truth into one `Execution guidance` disclosure.
- Execute still keeps mission truth explicit, but side-thought capture is now a quieter `Protect focus` disclosure instead of another always-open support card.
- Existing `Mission details`, `System details`, and recent-session disclosures remain, but the route now exposes less parallel reading before the user starts or closes a session.

## Why this pass

The product was becoming visually stronger, but still carried too much simultaneous reading load. The problem was not missing styling. It was that too many support lists, helper sentences, and optional route choices were treated as first-class surfaces. This pass establishes a stricter rule: preview first, disclose the rest.

## Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Risk

Low. The only regressions found were stale proof assumptions that support text would stay always visible. Those were corrected to the stronger current contract: the support surfaces still exist, but they are intentionally secondary and disclosure-based now.
