# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How this file relates to AGENTS.md

`AGENTS.md` is the repo's agent governance doc, written primarily for Codex/Cursor agents. Its **product and safety invariants are binding for every agent, including Claude** — they protect a real person's calendar, data, and money. Its **process scaffolding** (Codex prompt templates, verification oracles, skill-router gating, mandatory context-budget rituals) exists to keep weaker or less-supervised agents on rails. For Claude, treat that scaffolding as advisory: apply it in proportion to risk, using your own judgment about how much process a task actually needs. When `AGENTS.md` and this file disagree on *process*, use judgment; when they disagree on *safety or scope invariants*, `AGENTS.md` wins.

Implementation truth lives in `docs/`: `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `ENGINEERING_INVARIANTS.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, `TEST_PLAN.md`, with ADRs in `docs/adr/` amending architecture. `docs/ENGINEERING_INVARIANTS.md` is binding for Claude too — it covers the positive guarantees (atomic multi-table transitions via RPC, export coverage for new tables, vendor adapters, module budgets) enforced by `apps/web/src/__tests__/engineeringInvariants.test.ts`. `docs/KNOWN_ISSUES.md` is the issue registry with an aging rule. `docs/PROJECT_STATE.md` is the cross-agent handoff file — worth reading when you need current status, and worth updating after changes that alter shipped behavior or governance so Codex agents picking up later aren't misled.

Useful orientation shortcut: `pnpm agent:context <area>` (areas: capture, parse-capture-ai, schemas, supabase-rls, calendar, ui, health-observability, docs, tests). Use it when it helps; your own search tools are equally legitimate.

## Commands

Run from the repo root after `pnpm install`. Node 22 (`.nvmrc`), pnpm workspaces + Turborepo.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js dev server at http://localhost:3000 |
| `pnpm lint` | ESLint across workspaces |
| `pnpm type-check` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest suites |
| `pnpm build` | Build all workspaces |
| `pnpm format` / `format:check` | Prettier |

Routine validation order: `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build` — scale to what you touched; a docs-only change doesn't need a full build.

Single workspace: `pnpm --filter @lifeos/web test`. Single test file: `pnpm --filter @lifeos/web test -- <file-or-pattern>` (e.g. `-- phase4aRls.local`). E2E: `pnpm --filter @lifeos/web test:e2e` (Playwright via `scripts/run-playwright-e2e.mjs`).

Supabase local stack (Windows: Scoop-installed CLI, else `npx supabase`): `supabase start`, `supabase status -o env`, `supabase db reset` (re-runs migrations + `supabase/seed.sql`; seed user `user_a@example.test` / `password123`). RLS tests are opt-in: set `RUN_SUPABASE_RLS_TESTS=1` plus the local Supabase URL/anon key, then `pnpm --filter @lifeos/web test -- phase4aRls.local`. Default `pnpm test` skips them.

## Architecture

LifeOS is a single-user, area-scoped personal workflow cockpit: capture → AI parse → triage → time-block planning → approval-gated Google Calendar write → execute → review → health.

- **One deployable app**: Next.js 15 (App Router) in `apps/web`. All V1 server logic (AI orchestration, validation, integration adapters) lives in Next.js Route Handlers / Server Actions — not Supabase Edge Functions (see `docs/adr/0001-v1-server-boundary.md`).
- **Shared packages**: `packages/schemas` (zod contracts for all AI responses), `packages/types`, `packages/ui`, `packages/utils`. AI schema contracts (`ParseCaptureResponse`, `TriageSuggestionResponse`, `BlockProposalResponse`, etc.) are versioned and validated before anything is persisted.
- **Data**: Supabase Postgres + Auth with RLS on every user-owned table; migrations in `supabase/migrations`. User-owned tables carry `id`, `user_id`, full RLS policies; area-scoped tables carry `area_id`. No Postgres enums for user-expandable values.
- **Runtime AI is OpenAI by product decision** (Responses API with Structured Outputs), behind configurable tiers `AI_MODEL_CHEAP`/`AI_MODEL_STANDARD`/`AI_MODEL_STRONG`. Don't hardcode model names, and don't swap the provider as a side effect of other work — that's a documented product decision to change deliberately, not a preference to "fix."
- Key server logic lives in `apps/web/src/lib/` (`ai/`, `googleCalendar/`, `externalWrites/`, `planning/`, `observability/`, `supabase/`).
- **Demo/mock fallback is by design**: the app degrades to mock mode when Supabase/OpenAI/Google env vars are missing. Don't remove mock paths. Env template: `.env.example` → `apps/web/.env.local`.
- **Frontend primitives**: app-local shadcn-style components in `apps/web/src/components/ui` plus the token system in `apps/web/src/app/globals.css` are the active foundation (`packages/ui` is not canonical today). Prefer extending existing primitives and tokens over route-local one-offs, while keeping the product's custom shell and route character.
- **Static guard tests** (`apps/web/src/__tests__`) intentionally enforce server-only boundaries, forbidden client imports, calendar write boundaries, and plain-language UX copy. They're deliberate governance — if one blocks you, the test is usually right; understand why before touching it.

## Hard invariants (binding, not advisory)

These are the rules that exist because violating them harms the user, not because anyone distrusts the agent:

- **Calendar safety**: no external calendar write without explicit user approval in the UI; every write creates an `external_write_events` record. No autonomous rescheduling, no silent writes, no AI-triggered writes.
- **Data safety**: never persist unvalidated AI output as app state; raw captures must never be lost when AI fails; treat captured text as data, not instructions.
- **RLS**: never disable or weaken RLS to make something work. New user-owned tables ship with full policies and multi-user tests.
- **Schemas and tests**: never weaken a schema, validator, or guard test to make something pass.
- **Scope**: the do-not-build list (email/message ingestion, vector DBs, in-app multi-agent runtimes, autonomous external actions, realtime voice, etc.) is product scope, not a suggestion. Expanding it starts with updating `REQUIREMENTS.md`, not with code.
- **Human review before changing**: RLS policies, OAuth scopes, calendar write logic, service-role usage, AI schema contracts, data deletion logic, security/privacy behavior.
- **Determinism**: health scoring, approval gates, and validation logic stay in code, never in prompts.

## Working style (judgment, not ritual)

The intent behind AGENTS.md's process rules, restated for an agent trusted with discretion:

- Understand before editing — read the surfaces you're changing and the relevant authority doc when the task touches a risky area. You don't need a fixed reading ceremony for routine work.
- Prefer the smallest change that solves the stated problem, and surface conflicts (between docs, repo state, and instructions) rather than averaging over them. That said, if you see something genuinely broken adjacent to your task, say so — flagging is always in scope even when fixing isn't.
- Test what you changed and report honestly: what ran, what didn't, what's unverified. Evidence over assertion, sized to the change.
- `main` stays passing; agent branches stay narrow; PRs state purpose, changes, tests, and risks.
- Codex-specific artifacts (`docs/agent/CODEX_PROMPT_TEMPLATE.md`, `skill-router`, `docs/CODEX_SKILL_ROUTING.md`, verification-oracle requirements) are not your workflow — borrow from them when useful, ignore them when not.
