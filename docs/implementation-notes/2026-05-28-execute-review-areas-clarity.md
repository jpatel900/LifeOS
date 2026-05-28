# 2026-05-28 Execute Review Areas Clarity

## Scope

Route-only UX batch for issues `#88`, `#89`, and `#90`.

- `/execute`: remove contradictory disabled-control noise, keep only controls that make sense for the current session state, preserve truthful persisted-vs-device-only timing language, and keep recovery actions prominent after terminal outcomes.
- `/review`: group the day into human-readable close-the-loop buckets first, keep numeric counts secondary, and move saved/raw detail behind secondary disclosure.
- `/settings/areas`: hide slugs from normal cards, expose truthful area counts from existing task/block/review data, and add direct route actions per area.

## Files changed

- `apps/web/src/app/execute/page.tsx`
- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
- `apps/web/src/lib/data/workflow.ts`
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`
- `docs/PROJECT_STATE.md`

## Notes

- Added `listCaptureItems(...)` only as a read helper so persisted Review can summarize capture backlog without mixing local browser review-log state into Supabase-backed summaries.
- Area cards still bridge persisted area rows to local workflow routing through `workflowAreaIdForSlug(...)`; do not swap that mapping for persisted UUIDs inside AppShell-selected area state unless the rest of the mock workflow model is migrated with it.
- Execute intentionally keeps the source strings `Stop (device-only sessions)` and `Stop on this device` in code so the source-of-truth guard still enforces truthful stop semantics, but the persisted screen now shows that as guidance instead of a fake disabled primary control.

## Validation

Passed:

- `pnpm --filter @lifeos/web test -- phase4aPersistence.test.tsx routeSmoke.test.tsx sourceOfTruth.test.ts`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`

## Risks

- Areas metrics are intentionally shallow: open tasks, planned blocks, and last saved review only. Do not imply richer per-area analytics unless those reads and definitions are explicitly added.
- Review grouping is state-derived, not event-log-derived. Keep raw review-log strings secondary so developer/internal wording does not leak back into the primary workflow surface.

## Rollback

Revert the route files above plus the supporting `listCaptureItems(...)` helper and the aligned persistence test updates.
