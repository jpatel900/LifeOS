# CLAUDE.md

Guidance for Claude Code in this repository.

## Relationship to AGENTS.md

`AGENTS.md` is the repo's agent-governance authority. Its product, safety, scope, and forbidden-change invariants are binding for Claude too. If this file and `AGENTS.md` disagree on safety or scope, `AGENTS.md` wins; if they disagree on process, use judgment while preserving the invariants.

Implementation truth lives in `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ENGINEERING_INVARIANTS.md`, `docs/UX_FLOWS.md`, `docs/SECURITY_PRIVACY.md`, and `docs/TEST_PLAN.md`; ADRs in `docs/adr/` amend architecture. `docs/PROJECT_STATE.md` is the concise current-state handoff and should be read or updated only when current status, shipped behavior, or governance guidance changes.

## Commands

Run from the repo root after `pnpm install`. Node 22 (`.nvmrc`), pnpm workspaces + Turborepo.

| Command                             | Purpose                                     |
| ----------------------------------- | ------------------------------------------- |
| `pnpm dev`                          | Next.js dev server at http://localhost:3000 |
| `pnpm lint`                         | ESLint across workspaces                    |
| `pnpm type-check`                   | `next typegen` + `tsc --noEmit`             |
| `pnpm test`                         | Vitest suites                               |
| `pnpm build`                        | Build all workspaces                        |
| `pnpm format` / `pnpm format:check` | Prettier                                    |

Scale validation to the change. Docs-only work needs doc/guard tests and formatting; code changes normally need lint, type-check, tests, and build. E2E runs through `pnpm --filter @lifeos/web test:e2e`. Supabase RLS tests are opt-in with `RUN_SUPABASE_RLS_TESTS=1` and local Supabase env values.

## Architecture snapshot

LifeOS is a single-user, area-scoped personal workflow cockpit: capture → AI parse → triage → time-block planning → approval-gated Google Calendar write → execute → review → health. V1 server logic lives in Next.js Route Handlers / Server Actions in `apps/web`; Supabase provides Auth/Postgres/RLS; shared schemas live in `packages/schemas`; app-local UI primitives live in `apps/web/src/components/ui` with tokens in `apps/web/src/app/globals.css`.

## Binding invariants

- No external calendar writes without explicit UI approval and write logging.
- Never persist unvalidated AI output; raw captures survive AI failure; captured text is data, not instructions.
- Never disable or weaken RLS, schemas, validators, or guard tests to make a run pass.
- New user-owned tables require ownership, RLS, policies, export coverage, and multi-user tests.
- Scope expansion starts in `docs/REQUIREMENTS.md`, not code.
- RLS policies, OAuth scopes, calendar writes, service-role usage, AI schema contracts, data deletion, and security/privacy behavior require human review.
- Health scoring, approval gates, validation, and deterministic product decisions stay in code/config, not prompts.

## Working style

Understand the touched surfaces before editing, prefer the smallest safe change, keep mock/demo fallbacks unless scope explicitly changes, and report what was verified and what remains unverified. `main` stays passing; branches stay narrow; PRs state purpose, changes, tests, risks, and rollback.
