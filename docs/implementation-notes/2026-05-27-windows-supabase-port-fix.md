# Windows local Supabase port exclusion fix

- Task name: Resolve issue #76 Windows local Supabase port exclusion blocker
- Scope: local-dev Supabase port mapping, local verification defaults, and durable evidence only

## Goal

Restore reliable local Supabase startup and reset on this Windows workspace without changing LifeOS runtime behavior, RLS policy, auth rules, parser behavior, or production environment assumptions.

## Root cause

- The repo-local Supabase port cluster overlapped the Windows excluded TCP range shown on this machine: `54318-54417`.
- The overlap was wider than the original symptom suggested:
  - API `54321`
  - DB shadow `54320`
  - DB `54322`
  - Studio `54323`
  - Inbucket `54324-54326`
  - Analytics `54327-54328`
- Because the stack was configured inside the blocked window, local `supabase start` / `supabase db reset` could fail nondeterministically even when Docker itself was healthy.

## Fix

- Moved the local Supabase public ports to a clean low-numbered range outside the excluded window and away from the flaky `543xx` cluster:
  - API `15431`
  - DB shadow `15432`
  - DB `15433`
  - Studio `15434`
  - Inbucket `15435`
  - SMTP `15436`
  - POP3 `15437`
  - Analytics `15438`
  - Analytics vector ingest `15439`
- Updated local RLS test defaults and README examples to use `http://127.0.0.1:15431`.

## Why this path

- It is the smallest repo-local fix that removes the entire blocked port cluster instead of patching only one failing port.
- It preserves the current local-development workflow (`supabase start`, `supabase status -o env`, `supabase db reset`) and does not require weakening Windows networking policy, Docker settings, or LifeOS runtime code.
- It keeps the guidance honest: operators should still prefer `supabase status -o env` for live values, but the documented/default local URL now matches the fixed config.

## Validation target

- `supabase start` succeeds on the new port set.
- `supabase db reset` succeeds after the port change.
- The local route smoke and opt-in `phase4aRls.local` path can run again with exact evidence.

## Validation results

- `supabase start`: passed on the remapped local stack (`15431-15439`).
- `supabase db reset`: passed after the port remap.
- `supabase status -o env`: passed and reported `API_URL="http://127.0.0.1:15431"` and `DB_URL="postgresql://postgres:postgres@127.0.0.1:15433/postgres"`.
- `RUN_SUPABASE_RLS_TESTS=1 ... pnpm --filter @lifeos/web test -- phase4aRls.local`: passed (`14/14` tests).
- `pnpm lint`: passed.
- `pnpm type-check`: passed.
- `pnpm test`: passed.
- `pnpm build`: passed.
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`: passed (`12/12`).
- Ad hoc browser `/login` sign-in smoke still returned `Supabase is not configured. Add local Supabase env vars to use login, or continue in mock mode.` even after the port fix and a local `apps/web/.env.local` file. That behavior is not explained by the Windows port exclusion and should be treated as a separate local browser-auth/env-plumbing investigation if persisted `/login` smoke is required.

## Risks / non-goals

- This is a workspace-local development fix, not a production change.
- Historical notes that mention the old blocked `54322` failure remain intentionally unchanged as prior evidence, even though follow-up verification also confirmed the same Windows exclusion affected the default analytics port `54327`.
