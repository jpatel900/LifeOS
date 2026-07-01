# Dependabot Triage and Remediation (2026-07-01)

- Task: resolve the 21 open Dependabot alerts on `main` (6 high, 10 moderate, 5 low)
- Branch: `sec/dependabot-triage-2026-07`
- Precedent followed: `docs/implementation-notes/2026-05-27-postcss-cve-remediation.md` (smallest dependency change, prove the lockfile no longer resolves vulnerable versions, workspace override only where in-range resolution cannot reach the patch)

## Triage summary

The 21 alerts map to 10 distinct packages. None are direct dependencies of any workspace package — all arrive transitively. Reachability:

- **Runtime, server**: `@grpc/grpc-js`, `protobufjs`, `@opentelemetry/core` (OTLP export via `@opentelemetry/sdk-node`, a direct dep of `@lifeos/web`).
- **Runtime, browser**: `dompurify` (posthog-js session replay), `ws` (Supabase realtime client — the vulnerable server-side fragment handling is largely N/A in a client role, fixed anyway since in-range).
- **Build/dev only**: `js-yaml` (eslint), `vite` + `esbuild` (vitest/plugin-react), `form-data` (jsdom), `@babel/core` (styled-jsx/next + Sentry bundler plugin). The vite/esbuild Windows advisories are relevant to local dev on this Windows machine, so they were fixed rather than waived.

All 21 alerts were remediated; no alert was deliberately left open.

## Fixes applied

| Alerts | Package | Before → After | Mechanism |
| --- | --- | --- | --- |
| #31, #32 (high) | `@grpc/grpc-js` | 1.14.3 → 1.14.4 | in-range lockfile bump |
| #33 (low) | `esbuild` | 0.27.7 → 0.28.1 | in-range after vite 7.3.6 widened its range to `^0.27.0 \|\| ^0.28.0` |
| #35, #36, #37 (med/high/med) | `protobufjs` | 8.4.0 → 8.6.5 | existing workspace override raised `^8.0.2` → `^8.6.0` |
| #38, #40–#45, #48 (8 alerts, med/low) | `dompurify` | 3.4.2 → 3.4.11 | in-range via posthog-js update |
| #39 (med) | `@opentelemetry/core` | 2.2.0 / 2.6.1 / 2.7.1 → 2.8.0 | see below |
| #46, #47 (high/med) | `vite` | 7.3.2 → 7.3.6 | new workspace override `vite: ^7.3.5` (vite is only peer-resolved; pnpm would not re-resolve it otherwise) |
| #49 (high) | `form-data` | 4.0.5 → 4.0.6 | in-range lockfile bump |
| #50 (high) | `ws` | 8.20.1 → 8.21.0 | in-range lockfile bump |
| #51 (low) | `@babel/core` | 7.29.0 → 7.29.7 | in-range lockfile bump |
| #53 (med) | `js-yaml` | 4.1.1 → 4.3.0 | in-range lockfile bump |

### The `@opentelemetry/core` alert (#39) needed three coordinated moves

1. `posthog-js` `^1.372.10` → `^1.396.3` (in-range minor): posthog dropped its browser OpenTelemetry stack entirely, which removed the exact-pinned `@opentelemetry/core@2.2.0` that no override or update could safely reach.
2. `@opentelemetry/sdk-node` `^0.217.0` → `^0.219.0` (direct dep of `@lifeos/web`, out-of-range bump of an experimental 0.x package): 0.219.0 pins core 2.8.0.
3. `@sentry/nextjs` `^10.52.0` → `^10.62.0` (in-range minor): newer `@sentry/node` no longer pins `@opentelemetry/instrumentation-http@0.214.0` (core 2.6.1).

## Deviations / tradeoffs

- Two direct-dependency range bumps (`posthog-js`, `@sentry/nextjs`) and one out-of-range bump (`@opentelemetry/sdk-node` 0.217 → 0.219) go slightly beyond pure lockfile churn. Each was required to clear alert #39; all are validated by the full suite below. The sdk-node bump is the riskiest of the three (experimental 0.x line) — observability code compiled and all observability tests pass.
- A full `pnpm dedupe` ran as part of forcing vite re-resolution; it removed 4 duplicate packages and shrank the lockfile. No package moved outside its declared range.
- One more override pin to maintain (`vite: ^7.3.5`), same maintenance tradeoff as the existing `postcss` and `protobufjs` overrides.

## Validation

- Lockfile sweep: no vulnerable version of any of the 10 packages resolves anywhere in `pnpm-lock.yaml` (only `@types/ws` matches the grep, which is a types-only package).
- `pnpm lint` — pass (9/9 tasks)
- `pnpm type-check` — pass (9/9 tasks)
- `pnpm test` — pass (268 passed, 20 RLS tests skipped by default as designed)
- `pnpm build` — pass (5/5 tasks)

## Files changed and why

- `pnpm-workspace.yaml`: raised `protobufjs` override floor to `^8.6.0`; added `vite: ^7.3.5` override.
- `apps/web/package.json`: `@opentelemetry/sdk-node` `^0.219.0`, `@sentry/nextjs` `^10.62.0`, `posthog-js` `^1.396.3`.
- `pnpm-lock.yaml`: re-resolved dependency graph removing all vulnerable versions.
- `docs/PROJECT_STATE.md`: recorded the remediation.
