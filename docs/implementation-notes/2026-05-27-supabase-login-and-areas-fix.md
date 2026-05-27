# Supabase login and Areas persisted smoke fix

- Task name: Resolve issues `#93` and `#94` on the shared Supabase login and Areas path
- Scope: client-side Supabase env detection, provider-row timestamp normalization, regression proof, and handoff only

## Goal

Restore truthful persisted `/login` and `/settings/areas` behavior locally without weakening schema contracts, removing mock fallback, or broadening scope into unrelated auth/deployment work.

## Root cause

Two separate bugs were stacked on the same user flow:

1. `apps/web/src/lib/supabase/config.ts` defaulted to `process.env` through an indirect object path, which prevented the browser bundle from reliably seeing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Supabase Data API rows returned ISO datetimes with timezone offsets such as `2026-05-27T10:46:45.150339-04:00`, while the client data layer validated persisted entities against schemas that expected normalized ISO datetime strings. The first visible break was `/settings/areas`, but the assumption was broader than one screen.

## Fix

- Kept browser-visible Supabase config on static `process.env.NEXT_PUBLIC_*` lookups in `apps/web/src/lib/supabase/config.ts` so Next can inline the values into the client bundle.
- Added a shared provider-boundary normalizer in `apps/web/src/lib/data/supabaseRowNormalization.ts`.
- Wired that normalizer into persisted entity parsing in:
  - `apps/web/src/lib/data/workflow.ts`
  - `apps/web/src/lib/data/health.ts`
- Added regression proof:
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - `apps/web/src/__tests__/login.test.tsx`
  - `apps/web/src/lib/data/workflow.test.ts`
  - `apps/web/src/lib/data/health.test.ts`

## Why this path

- The env fix addresses the actual Next client-bundle boundary instead of papering over it with runtime branching.
- The timestamp fix stays at the provider boundary instead of weakening schemas or leaving the same latent bug to reappear on the next persisted screen.
- Mock fallback, auth rules, RLS, migrations, and production env assumptions stay unchanged.

## Validation results

- Focused regression suite passed:
  - `pnpm --filter @lifeos/web test -- src/lib/data/workflow.test.ts src/lib/data/health.test.ts src/__tests__/login.test.tsx src/__tests__/sourceOfTruth.test.ts`
  - Result: `53/53` passed
- Repo validation passed:
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm test`
  - `pnpm build`
- Local persisted smoke passed on a fresh dev server with local Supabase env vars:
  - `/login` loaded
  - sign-in with `user_a@example.test` / `password123` redirected to `/settings/areas`
  - persisted areas were visible: `Main Job`, `Personal`, `Volunteer Work`, `Side Project`
  - `Supabase is not configured` was absent
  - `Areas could not load` was absent

## Remaining caveats

- `pnpm format:check` still fails on broad pre-existing repo formatting drift, including historical `.playwright-mcp` artifacts and unrelated tracked files. This fix did not attempt a repo-wide mechanical formatting pass.
- Local proof closes the runtime bug behind issue `#94`, but production issue `#93` still needs an authenticated Vercel smoke pass because deployment protection previously blocked direct `/login` verification from this environment.
