---
name: lifeos-testing
description: Use for LifeOS test failures, regression coverage, Vitest, route and smoke checks, CI-style proof, local Supabase RLS validation, and final validation command execution.
---

# lifeos-testing

## Use when

- Fixing failing tests, adding/updating unit/integration/regression/smoke tests, verifying route behavior, or running completion validation.

## Boundaries

- `AGENTS.md`, authority docs, and direct instructions override this skill.
- Preserve existing tests and source-of-truth static guards.
- Do not weaken tests, schemas, validation, RLS policies, calendar boundaries, observability vendor guards, or plain-language UX guards to get green runs.
- Do not invent unrelated coverage requirements outside the scoped change.

## Required validation by surface

- Unit/schema/integration tests pass for changed logic, schemas, Route Handlers, or Server Actions.
- RLS tests pass with at least two users when DB/RLS changed.
- Calendar write paths are tested with mock before real provider.
- E2E/browser smoke passes when UX behavior changed.
- `pnpm lint`, `pnpm type-check`, and `pnpm test` pass before claiming code completion; include `pnpm build` for code changes where feasible.

## Procedure

1. Identify the minimum proof surface before editing.
2. Run focused checks first, then full validation appropriate to the change.
3. Add regression coverage without loosening assertions.
4. Default final sequence for code changes: `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`.
5. For DB/RLS, include local Supabase coverage with `RUN_SUPABASE_RLS_TESTS=1` and env values from `supabase status -o env`.
6. If any command is skipped or fails, report exactly which command, exit state, and why.

## Done criteria

- Existing tests and guardrails are preserved.
- Focused and final validation match the touched surface.
- Failures, skips, and environment limitations are reported exactly.
