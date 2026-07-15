# LifeOS

Area-scoped personal workflow cockpit. V1 is the shipped baseline, not the product ceiling. The current surface includes Today/Home Cockpit v1, Supabase-backed areas and workflow slices, AI parse-capture routing, Google Calendar connection/free-busy/approval-gated event creation, observability wrappers, and broad UX hardening, while the Phase 2 mock vertical slice remains available for local triage. Reviewed evolution follows [ADR 0005](docs/adr/0005-staged-evolution-after-v1.md).

Project documentation lives in `docs/`. For bounded agent/developer orientation, search first, use `pnpm agent:context <area>` when helpful, then read `docs/PROJECT_STATE.md` and the relevant authority docs only as needed. These helpers do not replace authority docs.

## Documentation authority order

Authority decreases down the list. Higher entries override lower ones when they conflict.

1. **AGENTS.md** — Agent operating rules; highest authority for Cursor/Codex behavior.
2. **REQUIREMENTS.md** — Product requirements, permanent boundaries, and approved evolution scope.
3. **ARCHITECTURE.md** — Technical architecture and boundaries.
4. **DATA_MODEL.md** — Canonical domain and data model.
5. **ENGINEERING_INVARIANTS.md** — System-level engineering guarantees and their enforcement.
6. **UX_FLOWS.md** — User journeys and screen behavior.
7. **SECURITY_PRIVACY.md** — Security, privacy, auth, and external-write rules.
8. **TEST_PLAN.md** — Acceptance tests and validation requirements.
   The implementation authority docs are `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `ENGINEERING_INVARIANTS.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, and `TEST_PLAN.md`. `AGENTS.md` governs agent behavior above all of them.

Architecture Decision Records in `docs/adr/` clarify or amend `ARCHITECTURE.md` for the decisions they record.

## Environment variables

Use `.env.example` at the repo root as the template. When wiring Supabase, OpenAI, or Google, copy the needed lines into `apps/web/.env.local` so Next.js picks them up. Never commit real secrets.

Mock mode remains usable without Supabase, OpenAI, or Google OAuth vars for the Phase 2 shell and offline flows.

## Production / Vercel rollout

There is no single `DEMO_MODE=false` switch in this repo.

The app falls back to Demo mode when the relevant production integrations are not configured:

- missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` => local/browser fallback paths stay active
- missing `OPENAI_API_KEY` or all AI model tier vars => AI capture sorting falls back to Demo mode sorting
- `AI_PARSE_CAPTURE_ENABLED=false` => AI capture sorting is explicitly disabled
- missing Google OAuth vars or `SUPABASE_SERVICE_ROLE_KEY` => Google Calendar connect/write paths stay unavailable

For a real Vercel deployment with the current shipped feature set, set these environment variables in the Vercel project:

Required for persisted app behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for server-side Google Calendar connect, free/busy, and approval-gated event creation:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Required for AI capture sorting:

- `OPENAI_API_KEY`
- one of `AI_MODEL_STANDARD`, `AI_MODEL_CHEAP`, or `AI_MODEL_STRONG`
- optional: `AI_PARSE_CAPTURE_ENABLED=true`

Optional observability:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

What this does not change:

- persisted `/execute` still does not support a live elapsed timer or persisted stop/resume workflow beyond the shipped truthfulness contract
- Google Calendar writes remain explicit approval-only
- mock/demo fallback code remains in the repo by design for local degraded operation

Recommended rollout order:

1. Set the required Vercel env vars.
2. Redeploy.
3. Verify `/login`, `/settings/areas`, `/capture`, `/triage`, `/calendar`, `/execute`, `/review`, and `/health`.
4. Confirm Google Calendar connect, free/busy, and explicit event creation with a non-critical test calendar before relying on it.

Use [docs/VERCEL_PRODUCTION_CHECKLIST.md](docs/VERCEL_PRODUCTION_CHECKLIST.md) for the exact env matrix and post-deploy smoke order.

## Supabase local development

On Windows, the recommended path is a Scoop-installed Supabase CLI (`supabase` in PATH). If `supabase` is unavailable, use the `npx` fallback commands shown below.

CI pins the CLI to a fixed release (`supabase/setup-cli@v1`, `version: 2.109.1` in `.github/workflows/ci.yml`) for reproducibility. Match that version locally if you hit CLI-version-specific behavior.

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
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:15431"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<ANON_KEY from supabase status -o env>"
pnpm --filter @lifeos/web test -- phase4aRls.local
```

```bash
RUN_SUPABASE_RLS_TESTS=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:15431 \
NEXT_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY from supabase status -o env>" \
pnpm --filter @lifeos/web test -- phase4aRls.local
```

The default `pnpm test` run skips this suite because it requires Docker-backed local Supabase and seeded Auth users.

## Monorepo commands

Run from the repository root after `pnpm install`.

Recommended local validation order for routine checks: `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`.

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
