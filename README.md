# LifeOS

## Documentation authority order

Authority decreases down the list. higher entries **override** lower ones when they conflict.

1. **AGENTS.md** — Agent operating rules; highest authority for Cursor/Codex behavior.
2. **REQUIREMENTS.md** — Product requirements and V1 scope.
3. **ARCHITECTURE.md** — Technical architecture and boundaries.
4. **DATA_MODEL.md** — Canonical domain and data model.
5. **UX_FLOWS.md** — User journeys and screen behavior.
6. **SECURITY_PRIVACY.md** — Security, privacy, auth, and external-write rules.
7. **TEST_PLAN.md** — Acceptance tests and validation requirements.
8. **PROJECT_BRIEF.md** — Product context and thesis.

**Architecture Decision Records (ADRs)** in `docs/adr/` **clarify or amend ARCHITECTURE.md** for the decisions they record. If an ADR conflicts with informal notes elsewhere, **trust the ADR + ARCHITECTURE.md + this table**.

### Background / non-authoritative

- **LIFE_OS_WIKI.md** and **EXTRA_INFO_AND_RULES.md** — Ideas, governance reminders, and historical notes. **Not** implementation authority. Do not override the numbered docs above.

### V1 primary workflow screens vs Settings

To align **NFR-005** (six primary screens) with navigation that includes configuration: the **six primary workflow screens** are **Capture**, **Triage**, **Calendar / Planning**, **Execute**, **Review**, and **Health**. **Settings** (areas, policies, integrations) is **secondary / admin** — it supports the product but is **not** counted toward the six-primary limit.

### Server boundary (V1)

V1 application server logic uses **Next.js Route Handlers and Server Actions**. **Supabase Edge Functions** are **not** the default for core APIs in V1 (use **V1.5+** or documented exceptions for cron / specific integrations). Details: **`docs/adr/0001-v1-server-boundary.md`**.

## Environment variables

1. Use **`.env.example`** at the repo root as the **template** (placeholder names and comments only).
2. When wiring Supabase, OpenAI, or Google, copy the needed lines into **`apps/web/.env.local`** so Next.js picks them up (Next loads env files from the app package directory). **Never commit** `.env`, `.env.local`, or real keys. See **`AGENTS.md`** and **`SECURITY_PRIVACY.md`** for secrets handling.

| Variable                                                          | Notes                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                        | Supabase project URL. **NEXT*PUBLIC*** vars are exposed to the browser.               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                   | Supabase anon key (public). Still not a service role key.                             |
| `SUPABASE_SERVICE_ROLE_KEY`                                       | **Server only.** Must never be used in client components or leaked to the bundle.     |
| `OPENAI_API_KEY`                                                  | **Server only** (Route Handlers / Server Actions). Optional until AI features use it. |
| `AI_MODEL_CHEAP`, `AI_MODEL_STANDARD`, `AI_MODEL_STRONG`          | **Server-side** model tier names; avoid hardcoding model IDs in code.                 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | **Server only** for OAuth; secrets stay off the client.                               |

**Mock mode:** local development should remain usable **without** `OPENAI_API_KEY` or Google OAuth vars until those integrations are implemented (stubs/mocks). Do not require live AI or Google credentials for a basic UI/dev server.

See **`.env.example`** for inline comments and placeholder lines.

## Monorepo commands

Run from the **repository root** after **`pnpm install`**.

| Command             | Purpose                                                                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Turborepo `dev`: runs **`next dev`** for `apps/web` (typically [http://localhost:3000](http://localhost:3000)).                                                                                                              |
| `pnpm build`        | Turborepo **`build`**: runs dependency package **`tsc --noEmit`** (“build”), then **`next build`** for the web app.                                                                                                          |
| `pnpm lint`         | Turborepo **`lint`**: `tsc --noEmit`-style lint in packages; **`next lint`** in `apps/web`. Depends on **`^build`** (packages typecheck/build pass first).                                                                   |
| `pnpm type-check`   | Turborepo **`type-check`**: `tsc --noEmit` everywhere it is defined. Depends on **`^build`**.                                                                                                                                |
| `pnpm test`         | Turborepo **`test`**: **Vitest** in `packages/schemas`, `packages/utils`, and `apps/web`; **`node -e process.exit(0)`** placeholders in packages without tests yet (`@lifeos/types`, `@lifeos/ui`). Depends on **`^build`**. |
| `pnpm format`       | **Prettier** — writes formatting for the repo (uses **`.prettierrc.json`** and **`.prettierignore`**). Root-only script, not delegated through Turborepo.                                                                    |
| `pnpm format:check` | **Prettier** — check-only; exits non‑zero if files need formatting.                                                                                                                                                          |

Filter a single workspace: e.g. `pnpm --filter @lifeos/schemas test`.

**Verification:** execute the commands above locally after installing dependencies; this environment does not substitute for your machine’s `pnpm` run.
