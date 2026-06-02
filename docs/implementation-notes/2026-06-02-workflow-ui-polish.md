# Workflow UI polish batch for issues #131, #133, #135, #136, and #137

## Scope

Group the remaining safe workflow-screen polish items into one runtime batch because they share the same surfaces, tests, and acceptance boundary:

- calmer non-blocking loading states
- clearer empty-state next actions
- stronger card hierarchy on Triage and Planning
- explicit disclosure that Triage note actions are browser-local only
- saved reflection inputs on Review

## What changed

- Added `WorkflowLoadingState` and reused it on `/triage`, `/calendar`, `/execute`, `/review`, and `/settings/areas` so route loads no longer fall back to plain placeholder paragraphs.
- Extended `EmptyState` with an optional action slot so empty routes can point directly to the next useful screen without inventing page-specific variants.
- Reworked Triage action grouping so decision actions stay primary, refinement is separate, and browser-local note actions are clearly disclosed as not moving the item.
- Reordered Planning proposal/task card metadata so title, area, and lifecycle lead before secondary details, and removed fake/non-actionable proposal controls.
- Added persisted reflection text fields to Review daily summaries while keeping the existing numeric rollup intact.

## Non-goals

- No schema contract changes outside the already-supported `summary_json` payload shape on `review_entries`.
- No new persistence surfaces, migrations, RLS changes, auth changes, parser changes, or Google Calendar write changes.
- No navigation rename pass or broader command/shortcut system.

## Validation

- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
