# UI Mobile Surface Budget

Status: Active Pass 7 first-viewport budget rule
Purpose: Define the maximum first-viewport clutter allowed at `390px` before shell or route work is considered regressive
Read when: Changing shell, nav, route headers, support cards, first-viewport hierarchy, or mobile proof expectations
Do not use for: Desktop layout decisions, final audit scoring by itself, or permission to ignore route-specific judgment
Superseded by: n/a during Pass 7; amend this budget instead of creating another mobile-hierarchy rule

## Target viewport

Use `390px` width as the default mobile proof width for Pass 7.

Evaluate the route at rest, at the top of the page, with no extra scrolling.

## Budget rules

At first viewport on a primary workflow route:

1. The route’s main action surface must start in the first viewport.
2. The route’s primary action or primary input must also start in the first viewport.
3. No more than one flagship route surface should compete for attention at rest.
4. Shell chrome may frame the route, but it must not introduce an extra support band above the route’s own flagship surface on shell-quiet routes.
5. Diagnostics, secondary support cards, and extra disclosures should stay below the primary action unless the route is truly blocked.
6. If overflow support exists, it should collapse behind disclosure or later-page structure instead of stacking above the fold.

## Practical reading

This is not a pixel-perfect art rule. It is a clutter ceiling.

If a route needs:

- shell context
- a degraded-state warning
- a flagship card
- multiple support cards
- diagnostics

then something must be demoted, collapsed, or removed. Do not simply stack everything and claim it still works.

## Shell-specific implication

On routes where route-local work should win immediately, the shell should stay quiet enough that the first useful route action is still obvious before any shell support copy.

Current shell-quiet routes:

- `/`
- `/capture`
- `/calendar`
- `/execute`
- `/review`

## Review hooks

When a route or shell change touches this budget, the review note must answer:

1. What is the flagship surface in the first viewport?
2. Which primary action or input is visible without scrolling?
3. What support or diagnostics were moved lower or behind disclosure?
4. What remained intentionally visible for safety or truth?

## Test hooks

Use these proof surfaces when the budget is in play:

- `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- relevant focused route tests under `apps/web/src/__tests__/`
- screenshot proof under `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`

## Failure examples

Treat these as budget failures:

- shell support content above the route flagship on a shell-quiet route
- two competing primary cards at first scan
- primary CTA visible only after scrolling
- stacked support cards plus diagnostics above the main route task
- dense wrapped nav or shell controls that hide the route’s own action
