# LifeOS

LifeOS helps one person turn scattered thoughts into a next action and a realistic day. It is a private, single-user workflow cockpit: capture something quickly, decide what it means, plan deliberately, work the plan, and close the day without turning every thought into an automatic commitment.

Try the hosted app at [life-os-web-azure.vercel.app](https://life-os-web-azure.vercel.app/), or run it locally. LifeOS supports optional account persistence, demo sorting when AI is not configured, and Google Calendar integration. Calendar writes always require explicit approval.

## A day in LifeOS

Imagine Avery notices, “Send the revised budget before Friday,” while working.

1. Avery opens **Capture** from any moment, writes the thought, and saves it. The raw capture is kept as written.
2. In **Triage**, Avery chooses **Sort** when ready, reviews the resulting draft, and decides what becomes a task or stays unresolved. An **Area** keeps related work, such as “Finances” or “Home,” in one place.
3. In **Plan**, Avery creates or adjusts a time-block proposal. It stays inside LifeOS; creating an event in Google Calendar needs a separate explicit approval.
4. In **Flow**, Avery works from the current planned block and can capture a side thought without leaving the moment.
5. In **Close**, Avery reviews what happened, records the day, and leaves a clearer starting point for tomorrow.

The home cockpit groups this work into three moments:

| Moment    | Use it for                                                               |
| --------- | ------------------------------------------------------------------------ |
| **Start** | Orient, open Capture, Triage, Plan, or Review, and choose the next move. |
| **Flow**  | Work through the current planned block without expanding the plan.       |
| **Close** | Review the day, record outcomes, and prepare for the next one.           |

Capture is available from any moment. The Start pipeline also opens Triage, Plan, and Review. Deep links such as `/?capture=1`, `/?sheet=triage`, and `/?sheet=plan` open the same cockpit surfaces; older stage routes redirect there. The full behavior is specified in [UX flows](docs/UX_FLOWS.md).

## Quick start

Run these commands from the repository root. The checked-in runtime is Node 22.13.0, and the project pins pnpm 11.1.3.

```powershell
node --version
# Expected: v22.13.0

corepack pnpm --version
# Expected: 11.1.3

corepack pnpm install
corepack pnpm dev
# Expected: the web app is available at http://localhost:3000
```

If pnpm is already enabled through Corepack, `pnpm install` and `pnpm dev` are the equivalent commands. A basic local shell works without integration variables.

For routine checks, run:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm type-check
corepack pnpm test
corepack pnpm build
```

## Accounts, demo mode, and integrations

LifeOS is intentionally honest about where work is saved.

- **Demo or local fallback:** without the relevant Supabase configuration, account features are unavailable and work can stay in the browser or on the device. This is useful for trying the shell; it is not account persistence.
- **Account mode:** Supabase-backed areas and workflow data require sign-in. The app distinguishes “saved on this device” from “saved to your account” instead of treating them as interchangeable.
- **AI sorting:** Capture saves raw text first. Sorting is an explicit Triage action. If an AI environment is configured, the server can produce a draft; otherwise the demo sorter can still provide a local draft. In either case, the person reviews it before making work from it.
- **Google Calendar:** connecting an account and checking availability are optional. A proposed block stays inside LifeOS until the person explicitly asks to create a Google Calendar event.

Copy only the required values from [.env.example](.env.example) into `apps/web/.env.local` for the integrations you are configuring; replace placeholders with your own values. Never commit real keys. For the local Supabase stack, map `API_URL` from `supabase status -o env` to `NEXT_PUBLIC_SUPABASE_URL`, and map `ANON_KEY` to `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The complete variable matrix and deployment smoke order live in the [Vercel production checklist](docs/VERCEL_PRODUCTION_CHECKLIST.md).

### Local Supabase and RLS checks

The default test suite does not start Docker or validate row-level security. On Windows, install the Supabase CLI with Scoop so `supabase` is on `PATH`; if it is unavailable, use the `npx supabase` fallback shown below. For local persistence and RLS work, start the local stack and get its generated public values:

```powershell
supabase start
# Or: npx supabase start

supabase status -o env
# Or: npx supabase status -o env
```

Use `supabase db reset` (or `npx supabase db reset`) only for the local development database. It applies migrations and seeds the local RLS test users, including `user_a@example.test` with password `password123`. With the local stack running, opt into the RLS test tier with the generated anonymous key:

```powershell
$env:RUN_SUPABASE_RLS_TESTS = "1"
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:15431"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<ANON_KEY from supabase status -o env>"
corepack pnpm --filter @lifeos/web exec vitest run src/__tests__/phase4aRls.local.test.ts --pool=threads --maxWorkers=4
```

`NEXT_PUBLIC_*` values are browser-safe public configuration. Never put `SUPABASE_SERVICE_ROLE_KEY` in browser code. The [test plan](docs/TEST_PLAN.md) and repository [Supabase/RLS skill](.agents/skills/lifeos-supabase-rls/SKILL.md) cover the two-user procedure; this README does not replace migration, RLS, or production-apply procedures.

## What is proven, and what is not

The repository has automated unit, integration, browser, and local-stack test coverage for defined technical behavior. Those tests do not prove personal adoption, usefulness, or that a configuration is present in a particular deployment. The current program status, remaining gates, and known limits are kept in [PROJECT_STATE.md](docs/PROJECT_STATE.md).

LifeOS is not a team workspace, a SaaS collaboration product, or an autonomous rescheduler. It does not silently create external calendar events or let AI output bypass review and validation.

## Documentation

Read the smallest relevant source of truth. If documents conflict, the higher entry in this order wins.

| Read this                                                | For                                                     |
| -------------------------------------------------------- | ------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                   | Repository operating rules and contributor boundaries.  |
| [Requirements](docs/REQUIREMENTS.md)                     | Product scope and non-negotiable behavior.              |
| [Architecture](docs/ARCHITECTURE.md)                     | Application boundaries and system structure.            |
| [Data model](docs/DATA_MODEL.md)                         | Canonical domain and persistence model.                 |
| [Engineering invariants](docs/ENGINEERING_INVARIANTS.md) | System guarantees and their enforcement.                |
| [UX flows](docs/UX_FLOWS.md)                             | User journeys, entry points, and interaction rules.     |
| [Security and privacy](docs/SECURITY_PRIVACY.md)         | Auth, data, and external-write boundaries.              |
| [Test plan](docs/TEST_PLAN.md)                           | Validation requirements and test tiers.                 |
| [Architecture decisions](docs/adr/README.md)             | Decisions that amend the architecture.                  |
| [Project state](docs/PROJECT_STATE.md)                   | Current program, maturity, constraints, and open gates. |

For the headless client surface, see [the CLI package](packages/cli). For deployment configuration, use the [Vercel production checklist](docs/VERCEL_PRODUCTION_CHECKLIST.md), not this README.
