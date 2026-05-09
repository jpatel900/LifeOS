---
name: lifeos-testing
description: Use for LifeOS test failures, regression coverage, Vitest, route and smoke checks, CI-style proof, local Supabase RLS validation, and final validation command execution.
---

# lifeos-testing

## Use when

- Fixing failing tests.
- Adding or updating unit, integration, regression, or smoke tests.
- Verifying route behavior or workflow regressions.
- Running completion validation for a change.

## Do not use when

- You are only doing early planning without running or editing tests.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Preserve existing tests. Do not weaken tests, schemas, or validation to get a green run.
- Do not invent new coverage requirements unrelated to the scoped change.

## Procedure

1. Identify the minimum test surface needed for the changed behavior.
2. Run focused relevant tests first when feasible, then run full validation when appropriate.
3. Add or update regression coverage without loosening assertions.
4. Run final validation in this sequence:
   - `pnpm format:check`
   - `pnpm lint`
   - `pnpm type-check`
   - `pnpm test`
   - `pnpm build`
5. If DB or RLS surfaces changed, include local Supabase RLS coverage with at least two users.
6. Remember opt-in local RLS tests require local Supabase plus env vars (`RUN_SUPABASE_RLS_TESTS`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
7. If any command is skipped or fails, report exactly which command and why.

## Done criteria

- Existing tests are preserved.
- Focused tests and full validation were run when appropriate.
- Failures or skips are reported exactly.
- RLS test expectations are called out when relevant.
