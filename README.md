# LifeOS

Area-scoped personal workflow cockpit. The app keeps the Phase 2 mock path available while Phase 4A adds local Supabase persistence for areas and raw capture items.

## Documentation Authority Order

Authority decreases down the list. Higher entries override lower ones when they conflict.

1. **AGENTS.md** - Agent operating rules; highest authority for Cursor/Codex behavior.
2. **REQUIREMENTS.md** - Product requirements and V1 scope.
3. **ARCHITECTURE.md** - Technical architecture and boundaries.
4. **DATA_MODEL.md** - Canonical domain and data model.
5. **UX_FLOWS.md** - User journeys and screen behavior.
6. **SECURITY_PRIVACY.md** - Security, privacy, auth, and external-write rules.
7. **TEST_PLAN.md** - Acceptance tests and validation requirements.
8. **PROJECT_BRIEF.md** - Product context and thesis.

The implementation authority docs are `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, and `TEST_PLAN.md`. `AGENTS.md` governs agent behavior above all of them.

Architecture Decision Records in `docs/adr/` clarify or amend `ARCHITECTURE.md` for the decisions they record.

## Environment Variables

Use `.env.example` at the repo root as the template. When wiring Supabase, OpenAI, or Google, copy the needed lines into `apps/web/.env.local` so Next.js picks them up. Never commit real secrets.

Mock mode must remain usable without OpenAI or Google OAuth vars until those integrations are implemented.

## Supabase Local Development

On Windows, the recommended path is a Scoop-installed Supabase CLI (`supabase` in PATH). If `supabase` is unavailable, use the `npx` fallback commands shown below.

Start the local Supabase stack:

```bash
supabase start
npx supabase start
```

Show local service URLs and keys:

```bash
supabase status
npx supabase status
supabase status -o env
```

Reset the local database, re-run migrations, and apply `supabase/seed.sql`:

```bash
supabase db reset
npx supabase db reset
```

`supabase/seed.sql` inserts local test users and starter areas for Phase 4A smoke tests. Use `user_a@example.test` with password `password123` at `/login`, then verify `/settings/areas` and `/capture`.

## Monorepo Commands

Run from the repository root after `pnpm install`.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Runs the Next.js app through Turborepo. |
| `pnpm build` | Builds all workspaces. |
| `pnpm lint` | Runs lint/type validation for configured workspaces. |
| `pnpm type-check` | Runs TypeScript checks. |
| `pnpm test` | Runs Vitest suites. |
| `pnpm format` | Formats the repo when configured. |
| `pnpm format:check` | Checks formatting when configured. |

Filter a single workspace with commands such as `pnpm --filter @lifeos/web test`.
