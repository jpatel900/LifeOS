# LifeOS

Area-scoped personal workflow cockpit. The Phase 2 mock vertical slice stays available for local triage while Phase 4A adds Supabase-backed areas and raw capture persistence when env vars are configured.

Project documentation lives in `docs/`. For bounded agent/developer orientation, start with `docs/agent/CONTEXT_INDEX.md` or `pnpm agent:context <area>`, then read `docs/PROJECT_STATE.md` and the relevant authority docs as needed. This helper is for orientation only and does not replace authority docs.

## Documentation authority order

Authority decreases down the list. Higher entries override lower ones when they conflict.

1. **AGENTS.md** — Agent operating rules; highest authority for Cursor/Codex behavior.
2. **REQUIREMENTS.md** — Product requirements and V1 scope.
3. **ARCHITECTURE.md** — Technical architecture and boundaries.
4. **DATA_MODEL.md** — Canonical domain and data model.
5. **UX_FLOWS.md** — User journeys and screen behavior.
6. **SECURITY_PRIVACY.md** — Security, privacy, auth, and external-write rules.
7. **TEST_PLAN.md** — Acceptance tests and validation requirements.
8. **PROJECT_BRIEF.md** — Product context and thesis.

The implementation authority docs are `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, and `TEST_PLAN.md`. `AGENTS.md` governs agent behavior above all of them.

Architecture Decision Records in `docs/adr/` clarify or amend `ARCHITECTURE.md` for the decisions they record.

## Environment variables

Use `.env.example` at the repo root as the template. When wiring Supabase, OpenAI, or Google, copy the needed lines into `apps/web/.env.local` so Next.js picks them up. Never commit real secrets.

Mock mode remains usable without Supabase, OpenAI, or Google OAuth vars for the Phase 2 shell and offline flows.

## Supabase local development

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

Run the opt-in local RLS tests after the stack is running and the database has been reset:

```powershell
$env:RUN_SUPABASE_RLS_TESTS = "1"
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<ANON_KEY from supabase status -o env>"
pnpm --filter @lifeos/web test -- phase4aRls.local
```

```bash
RUN_SUPABASE_RLS_TESTS=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY from supabase status -o env>" \
pnpm --filter @lifeos/web test -- phase4aRls.local
```

The default `pnpm test` run skips this suite because it requires Docker-backed local Supabase and seeded Auth users.

## Monorepo commands

Run from the repository root after `pnpm install`.

| Command                         | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `pnpm install`                  | Install dependencies                                             |
| `pnpm dev`                      | Runs the Next.js app through Turborepo (`http://localhost:3000`) |
| `pnpm --filter @lifeos/web dev` | Run only the web app                                             |
| `pnpm build`                    | Builds all workspaces                                            |
| `pnpm agent:context <area>`     | Print bounded repo context for one task area                     |
| `pnpm lint`                     | Lint / type validation for configured workspaces                 |
| `pnpm type-check`               | TypeScript checks                                                |
| `pnpm test`                     | Vitest suites                                                    |
| `pnpm format`                   | Format the repo when configured                                  |
| `pnpm format:check`             | Check formatting when configured                                 |

Filter a single workspace with commands such as `pnpm --filter @lifeos/web test`.

Example orientation command: `pnpm agent:context capture`

If you pass an unknown area, the script lists the available areas.
