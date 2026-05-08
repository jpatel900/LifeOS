# ADR 0001: V1 server boundary (Next.js server vs Supabase Edge Functions)

## Status

Accepted

## Context

LifeOS needs authenticated access to Postgres (RLS), server-side secrets (AI, OAuth), and deterministic workflow rules. The product docs historically mentioned Supabase Edge Functions as the default place for server logic. We need a single, explicit boundary for V1 so implementation, tests, and operations stay coherent.

## Decision

For **V1**:

1. Use **Next.js Route Handlers** and **Server Actions** in `apps/web` for application server logic (AI calls, validation, orchestration, Google Calendar adapter calls, and other mutations that belong in code next to the product).
2. Use **Supabase** for **Auth**, **Postgres**, **RLS**, migrations, and **local database development** (`supabase` CLI / local Postgres as adopted).
3. **Do not** use **Supabase Edge Functions** as the default V1 implementation path for core app APIs.

Use **Supabase Edge Functions** in V1 **only when** one of the following applies:

- A **scheduled** or **cron**-style job fits Supabase Cron + Edge Functions better than a Vercel cron invoking a secured Route Handler, or
- A **specific integration** cannot be implemented safely or reliably in Next server code (document the reason in a follow-up ADR or task before building).

Defer routine porting of “every endpoint” to Edge Functions to **V1.5 / later**, unless the exception above applies.

## Consequences

### Positive

- One primary **TypeScript** server surface (Next) aligned with the existing monorepo layout and agent workflows.
- Fewer deployed artifacts to reason about for early RLS + API + UI work.
- Server Actions / Route Handlers colocate with UI and shared packages (`@lifeos/schemas`, etc.).

### Negative / trade-offs

- Long-running or cron workloads may later move to Supabase Edge Functions + Cron; boundaries must stay documented.
- Operational logging and observability should name **Route Handlers / Server Actions** explicitly, not only Edge Functions.

## References

- `ARCHITECTURE.md` — stack and runtime diagrams (must stay aligned with this ADR).
- `AGENTS.md` — implementation expectations for agents.
