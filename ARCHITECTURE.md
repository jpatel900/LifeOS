# ARCHITECTURE.md

# Architecture — Area-Scoped Personal Workflow Cockpit

## 1. Architecture Goals

Optimize for:

1. one-person use
2. low cost
3. fast build
4. maintainability
5. minimal moving parts
6. future AI-agent maintainability
7. easy debugging
8. safe external writes

The architecture should be boring on purpose.

## 2. Recommended Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js | Common, agent-friendly, deploys easily |
| Hosting | Vercel Hobby initially | Low fixed cost, simple deployment |
| Database/Auth | Supabase | Postgres + Auth + RLS + local DB dev via Supabase tooling |
| Server logic (V1) | Next.js Route Handlers + Server Actions | Single app server surface; secrets and integrations stay in `apps/web` |
| Server logic (V1.5+ / optional) | Supabase Edge Functions | Deferred by default; use for cron or integrations that cannot live safely in Next (see `docs/adr/0001-v1-server-boundary.md`) |
| AI | OpenAI Responses API + Structured Outputs | Typed AI output and tool-ready interaction model |
| Calendar | Google Calendar API | Free/busy checks and approved event writes |
| Background jobs | None by default; Supabase Cron + Edge Functions only when justified | Avoid background complexity |

## 3. Runtime Architecture

```text
Browser / Next.js UI
  ↓
Supabase Auth
  ↓
Supabase Postgres with RLS
  ↓
Next.js server (Route Handlers + Server Actions)
  ├─ parse_capture
  ├─ triage_apply
  ├─ propose_blocks
  ├─ approve_calendar_write
  ├─ mark_block_result
  ├─ generate_review
  └─ health_check
      ↓
      ├─ OpenAI Responses API
      └─ Google Calendar API
```

Optional **V1.5+** (not the default V1 path): **Supabase Edge Functions** for scheduled jobs or specific integrations — see `docs/adr/0001-v1-server-boundary.md`.

## 4. Why No Separate Backend in V1

Do not add a separate Node/Express/Nest backend. Application logic lives in **Next.js** (Route Handlers and Server Actions). **Supabase** provides the database, auth, RLS, and migrations; it is not a second application server for core CRUD and AI flows in V1.

Supabase still provides:

- auth
- database
- Row Level Security
- local development tooling for Postgres
- optional Edge Functions and scheduled jobs **when** the ADR exception applies (cron or integration constraints)

Adding another backend beyond Next + Supabase data would increase cost, deployment complexity, secrets handling, and debugging overhead.

## 5. Repository Structure

```text
/apps
  /web
    /app
    /components
    /lib
    /routes
/packages
  /schemas
  /types
  /ui
  /utils
/supabase
  /migrations
  /seed
/docs
  /adr
    0001-v1-server-boundary.md
  (authoritative product/tech docs may live at repo root; see README.md)
```

Core workflows in V1 are implemented under `apps/web` (not under `supabase/functions`). Edge Functions under `/supabase/functions` are **V1.5+ / optional**, unless an ADR documents a V1 exception (cron or integration).

## 6. Core Architectural Components

### 6.1 Scope Resolver

Resolves policy values using:

```text
Item override → Area policy / learning → Global default
```

Used by:

- parser
- scheduler
- execution screen
- review
- health dashboard
- policy suggestions

### 6.2 Workflow Engine

Handles deterministic app state:

- capture status
- task status
- proposal status
- block status
- session status
- review status

This logic should not live inside prompts.

### 6.3 AI Orchestration Layer

Responsible for:

- schema-constrained parsing
- ambiguity assessment
- first-move generation
- priority scoring
- review summaries
- repair-guide explanations

Rules:

- all mutation-producing AI calls must use strict schemas
- AI output must validate before persistence
- failed validation becomes a recoverable error
- AI never directly performs external writes

### 6.4 Scheduling Suggestion Engine

Creates local proposals using:

- task estimate range
- area time preferences
- declared user constraints
- Google free/busy information
- missed-block history
- productivity patterns

V1 rule:

- suggest slots
- flag conflicts
- do not solve all conflicts automatically

### 6.5 Calendar Integration Adapter

Single wrapper around Google Calendar.

Allowed operations in V1:

- free/busy query
- insert event after approval
- update/cancel only after explicit user action

Do not sync the entire calendar.

### 6.6 Health Engine

Rule-based scoring for:

- auth
- database
- AI parsing
- calendar connector
- scheduler
- priority model
- duration model
- time preference model

AI may generate explanation text, but not the score.

### 6.7 Audit Layer

Logs:

- AI recommendations
- user decisions
- external writes
- policy changes
- overrides
- failed writes
- health incidents

Audit logs are essential for debugging future AI-agent changes.

## 7. AI Architecture

### 7.1 Stable Contract

The stable contract is not the model name.

The stable contract is:

- prompt version
- input schema
- output schema
- validation rules
- confidence thresholds
- error handling
- audit records

### 7.2 Model Routing

Use environment-configured model tiers:

| Tier | Use |
|---|---|
| `AI_MODEL_CHEAP` | area inference, labels, simple scoring |
| `AI_MODEL_STANDARD` | capture parsing, ambiguity assessment, block proposals |
| `AI_MODEL_STRONG` | complex weekly review, prompt/schema evaluation, admin debugging |

Do not hardcode exact model names in app logic.

### 7.3 Structured Output Schemas

Required schemas:

- `ParseCaptureResponse`
- `AmbiguityAssessmentResponse`
- `TriageSuggestionResponse`
- `BlockProposalResponse`
- `WeeklyReviewResponse`
- `PolicySuggestionResponse`
- `HealthNarrativeResponse`

### 7.4 AI Safety Rules

- Do not send more data than needed.
- Use `store: false` where supported.
- Never trust AI output without validation.
- Persist AI recommendations separately from committed user decisions.
- Every AI suggestion should expose confidence and rationale.

## 8. Background Jobs

Default: no always-on automation.

Allowed later:

- daily health sweep
- weekly review draft
- token validity check

Prefer **Supabase Cron** invoking **Edge Functions** for recurring jobs when those jobs truly belong off the Next runtime; otherwise prefer a minimal **Vercel cron** calling a **secured Route Handler** if that stays simpler for V1. Avoid depending on Vercel Hobby cron for precise or frequent jobs without checking limits.

## 9. Deployment Environments

### Local

- Supabase local dev
- local Next.js
- mock calendar adapter
- mock AI adapter for tests

### Preview

- Vercel preview deployment
- Supabase preview or separate dev project
- no production calendar writes unless explicitly configured

### Production

- Vercel Hobby/Pro as needed
- Supabase project
- Google OAuth configured
- environment secrets stored server-side

## 10. Observability

Minimum logging:

- Next.js Route Handler / Server Action invocation success/failure (and Edge Function invocations if used)
- AI validation failures
- calendar write attempts
- calendar write failures
- health check results
- RLS/security errors
- uncaught frontend errors

Do not log:

- full raw captures in external log drains
- access tokens
- secrets
- full AI prompts containing private data

## 11. Architecture Decision Records

Architecture Decision Records live under `/docs/adr/`.

| ADR | Decision | Status |
|---|---|---|
| [0001](docs/adr/0001-v1-server-boundary.md) | V1 server boundary: Next.js Route Handlers + Server Actions; Supabase Edge Functions not the default (V1.5+ / exceptions) | Accepted |

Additional invariants:

| Decision | Status |
|---|---|
| Use Supabase for data/auth instead of a separate backend service | Accepted |
| Use local proposals before calendar writes | Accepted |
| Keep external writes approval-gated | Accepted |
| Use strict schemas for AI output | Accepted |
| Avoid multi-agent runtime in app | Accepted |
| Avoid realtime voice in V1 | Accepted |
| Avoid full calendar sync | Accepted |

## 12. Architecture Risks

| Risk | Mitigation |
|---|---|
| RLS misconfiguration | Tests + deny-by-default policies |
| Calendar write duplication | Idempotency keys / proposal status checks |
| AI schema drift | Versioned schemas + validation |
| Prompt-only business logic | Move rules into code/config |
| Background job complexity | Avoid in V1 |
| Overbuilt scheduling engine | Suggest only; user decides |
| Future agent modifications breaking invariants | AGENTS.md + tests + forbidden zones |

## Reference Links

These documents are intentionally grounded in stable platform capabilities, not hardcoded vendor-specific hype.

- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Responses API migration / `store: false`: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Google Calendar Freebusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy
- Google Calendar Events Insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Vercel Cron Jobs / Hobby limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Anthropic Building Effective Agents: https://www.anthropic.com/research/building-effective-agents
