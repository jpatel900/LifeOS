# 2026-05-28 Area Management Soft Delete

## Original scope

Complete Area management with soft-delete and zero-area onboarding recovery only:

- let authenticated users create Areas
- let authenticated users remove Areas through soft delete only
- exclude removed Areas from active pickers and new work assignment
- keep historical `area_id` references safe
- guide zero-area accounts to create an Area instead of dead-ending

## Current schema findings

- `public.areas` already had the correct archive primitive: `is_active boolean not null default true`
- `listAreas()` already filtered active areas only through `is_active = true`
- authenticated browser Data API access for `areas` still allowed hard delete before this change
- the shared workflow provider still relied partly on canonical slug mappings, which broke custom persisted Areas created outside the original four seeded slugs

## Migration decisions

- added `supabase/migrations/20260528163000_disable_area_hard_delete.sql`
- revoked authenticated `DELETE` on `public.areas`
- dropped the authenticated `areas_delete_own` policy so user-facing Area removal stays update-based soft delete only
- did not introduce any hard delete, cascade delete, or destructive backfill

## RLS decisions

- preserved the existing own-row select/insert/update boundaries for `areas`
- kept cross-user visibility and mutation protection unchanged
- added local RLS regression coverage for authenticated area hard-delete denial
- local opt-in RLS execution could not be completed in this run because local Supabase was unavailable (`dockerDesktopLinuxEngine` pipe missing)

## Files changed and why

- `packages/schemas/src/index.ts`: added `CreateAreaInputSchema` and `SoftDeleteAreaInputSchema`
- `packages/schemas/src/index.test.ts`: added schema coverage for the new area input contracts
- `apps/web/src/lib/data/workflow.ts`: added `createArea()` and `softDeleteArea()`, preserved active-only reads, and kept slug/sort-order generation inside the typed data layer
- `apps/web/src/lib/data/workflow.test.ts`: added create and soft-delete data-layer coverage
- `apps/web/src/lib/workflowAreaMapping.ts`: added helpers so persisted custom Areas round-trip without relying on the original seeded slug map
- `apps/web/src/lib/WorkflowContext.tsx`: added reusable persisted-area sync and fixed custom-area selection state
- `apps/web/src/app/capture/page.tsx`: made persisted area selection work for custom Areas
- `apps/web/src/app/triage/page.tsx`: resolved new-work assignment against either direct persisted ids or canonical mapped ids
- `apps/web/src/app/settings/areas/page.tsx`: added Area creation UI, soft-delete UI, zero-area recovery, and active-area state refresh
- `apps/web/src/__tests__/WorkflowContext.areas.test.tsx`: added custom persisted-area mapping coverage
- `apps/web/src/__tests__/phase4aPersistence.test.tsx`: added zero-area create flow, soft-delete settings flow, and historical review fallback coverage
- `apps/web/src/__tests__/phase4aRls.local.test.ts`: added authenticated hard-delete denial coverage for `areas`
- `apps/web/src/__tests__/supabaseMigration.test.ts`: added migration guard for the area hard-delete revoke
- `supabase/migrations/20260528163000_disable_area_hard_delete.sql`: enforced soft-delete-only area lifecycle at the database permission/policy layer

## Validation results

- passed: `pnpm --filter @lifeos/schemas test -- index.test.ts`
- passed: `pnpm --filter @lifeos/web test -- workflow.test.ts WorkflowContext.areas.test.tsx phase4aPersistence.test.tsx supabaseMigration.test.ts`
- blocked: local Supabase RLS execution because `supabase status -o env` failed with missing `dockerDesktopLinuxEngine` pipe
- full repo validation was run after this note and is recorded in the final handoff

## Risks

- local RLS proof for the new area hard-delete denial is still pending until Docker/local Supabase is available again
- review history still falls back to `Saved area` when an inactive area name is not loaded into the active-area list; this is safe, but it is intentionally minimal

## Rollback notes

- revert `supabase/migrations/20260528163000_disable_area_hard_delete.sql` and the corresponding app/test changes together
- if the migration has already been applied locally, restore authenticated `DELETE` on `public.areas` and recreate the `areas_delete_own` policy only if you intentionally want to re-enable hard delete
