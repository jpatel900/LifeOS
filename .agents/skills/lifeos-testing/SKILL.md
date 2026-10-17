---
name: lifeos-testing
description: Use for LifeOS test failures, regression coverage, Vitest, route and smoke checks, CI-style proof, local Supabase RLS validation, and final validation command execution.
---

# lifeos-testing

Use for test failures, regression coverage, CI-style proof, and local Supabase RLS validation. `AGENTS.md` sets the evidence rule and the never-weaken-a-guard red line; this skill holds the LifeOS traps. RLS runs need `RUN_SUPABASE_RLS_TESTS=1` with env values from `supabase status -o env`.

## Environment-dependent lanes (cloud/sandboxed agents)

- Some suites pass VACUOUSLY without local services: mock fallbacks make `pnpm test` green even when Supabase-backed behavior is broken. Lanes that CANNOT be validated without env: Migrations + RLS (`RUN_SUPABASE_RLS_TESTS=1` + local Supabase), Playwright E2E (browsers), any provider-env path (OpenAI/Google).
- If your environment cannot run a lane, SAY SO in the PR body under "UNVERIFIED" — unverified is acceptable, unreported is not. CI is the authoritative gate for those lanes.
- When an issue names binding constraints, find and run the specific tests guarding them (grep the constraint's wording in `apps/web/src/__tests__/`) before opening the PR.

## A green signal counts only from the layer the claim is about

Distilled 2026-10-17 (#289) from `docs/FAILURES.md`. A pass proves only what actually ran, where it ran, and when.

- Before trusting green, confirm the check really executed (not cached, skipped, unwired, or satisfied by a mock) against the layer the claim names. Evidence: B7 mock-green vs CI-red (#291); Turbo replayed a cached PASS for a docs-reading guard (2026-08-21); `status.test.mjs` was never wired into CI (2026-08-29).
- Green at one layer is silent about the next: CI-green proves a migration correct, not applied (C3/C4, 2026-07-07); a drift check that looks one way cannot see the other (2026-08-21); a tool saying "PR created" proves nothing until the branch exists (Codex strandings, 2026-07-04/05).
- A probe is evidence only if its server-side log line shows it reached the layer under test (#361's first probe hit validation, not the provider).
- A PR's CI proves it against main as of that run. A PR that adds a repo-wide check (guard, formatter, lint rule) lands only with or after every known offender's fix, re-run against current main right before merge. Evidence: #331/#337 (2026-07-04), #471/#472 (2026-07-09).
- Enforcement points: required CI lanes; `scripts/agent/check-turbo-test-inputs.mjs`; the `program-state-self-test` job's vacuity floor; `scripts/agent/check-migration-drift.mjs` (both directions); `format-selfheal.yml` and `main-red-guard.yml` after a race. New guards follow the planted-violation rule in `docs/ENGINEERING_INVARIANTS.md`.

## Time and readiness in tests

Distilled 2026-10-17 (#289) from the September test fixes.

- Pin the clock in any test whose result depends on the current time, day, or time zone (Playwright `page.clock.setFixedTime`, Vitest fake timers). Evidence: #1029 (hour-rail geometry), #1051 (close-and-reload across midnight), #1042 (DST).
- In E2E, wait for an observable ready state — URL, focus, hydrated content — before acting or asserting. A fixed wait is not proof of readiness. Evidence: #1049 (history traversal), #1052 (keyboard focus and area hydration).
- Enforcement point: `apps/web/src/__tests__/blindWaitGuard.test.ts` (new `waitForTimeout` or bare `setTimeout` sleeps fail; existing waits are a shrink-only allowlist).

## Shared test mock discipline

- Any PR that adds a table, RPC, or write path MUST extend the shared mock Supabase client in the same PR. A mock that silently lacks the new surface makes every later test log errors ("query.insert is not a function") that train readers to ignore real failures. (Origin: B2 meta-learning writes; see docs/FAILURES.md.)
