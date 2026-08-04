# CLAUDE.md

Claude-specific facts for this repo. **`AGENTS.md` governs all agent behavior — read it first; this file only adds what Claude needs daily and never overrides it.**

Cold-starting? `docs/SYSTEM_MAP.md` (orientation) → `docs/PROJECT_STATE.md` (status) → `docs/program/` (the governing program and priority order).

## Commands

Run from the repo root after `pnpm install`. Node 22 (`.nvmrc`), pnpm workspaces + Turborepo.

| Command                             | Purpose                                     |
| ----------------------------------- | ------------------------------------------- |
| `pnpm dev`                          | Next.js dev server at http://localhost:3000 |
| `pnpm lint`                         | ESLint across workspaces                    |
| `pnpm type-check`                   | `next typegen` + `tsc --noEmit`             |
| `pnpm test`                         | Vitest suites                               |
| `pnpm build`                        | Build all workspaces                        |
| `pnpm format` / `pnpm format:check` | Prettier (`format:check` is blocking in CI) |

E2E: `pnpm --filter @lifeos/web test:e2e`. Supabase RLS tests are opt-in with `RUN_SUPABASE_RLS_TESTS=1` and local Supabase env values. Validation sequences, evidence rules, and merge authority: `AGENTS.md`.

## Architecture snapshot

Single-user, area-scoped workflow cockpit: capture → AI parse → triage → time-block planning → approval-gated Google Calendar write → execute → review → health, presented through the moments shell (ADR 0003). Server logic lives in Next.js Route Handlers in `apps/web` (zero Server Actions exist, though ADR 0001 permits them); Supabase provides Auth/Postgres/RLS; shared schemas in `packages/schemas`; UI primitives in `apps/web/src/components/ui` with tokens in `apps/web/src/app/globals.css`. One authoritative domain layer serves multiple clients via `/api/v1` (ADR 0006).
