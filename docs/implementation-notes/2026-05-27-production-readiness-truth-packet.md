# Production readiness truth packet

Date: 2026-05-27
Issue: #79
Scope: planning only

## Goal

Separate production configuration truth from UX-copy debt before more broad UI trust cleanup is treated as complete.

## Files inspected

- `README.md`
- `docs/VERCEL_PRODUCTION_CHECKLIST.md`
- `.env.example`
- `docs/PROJECT_STATE.md`

## Repo-grounded conclusions

### 1. Config truth vs UX debt

Warnings on the deployed app split into two buckets:

- Configuration or deployment truth:
  - missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` keeps persisted workflow features in browser-local fallback
  - missing `OPENAI_API_KEY` and model-tier env vars keeps AI capture sorting in fallback mode
  - missing Google OAuth vars, `GOOGLE_TOKEN_ENCRYPTION_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` keeps Google Calendar connection and write paths unavailable
- UX/copy debt:
  - implementation-heavy phrases like `Demo mode`, `Saved workspace`, `browser only`, `approval gate`, `local proposal`, `System details`, and `Developer details` can still make normal workflow screens feel unfinished even when the underlying behavior is correct

The first bucket is not solved by better wording. The second bucket must not hide the first.

### 2. Required Vercel env matrix

Required for persisted app behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for AI capture sorting:

- `OPENAI_API_KEY`
- at least one of `AI_MODEL_STANDARD`, `AI_MODEL_CHEAP`, `AI_MODEL_STRONG`
- optional but normally enabled: `AI_PARSE_CAPTURE_ENABLED=true`

Required for Google Calendar connect, free/busy, and approval-gated event creation:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Optional observability only:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

### 3. How to classify the deployed URL right now

Based on repo evidence alone, `https://life-os-web-azure.vercel.app/` should not be treated as production-ready proof yet.

Reason:

- the repo explicitly documents that there is no single production toggle
- `docs/PROJECT_STATE.md` still records a production-smoke evidence gap caused by deployment protection from this environment
- without verified Vercel env presence plus authenticated route smoke, the most honest classification is: deployed fallback candidate, not proven production behavior

Practical classification:

- not local-only, because it is a real deployed URL
- not confirmed production-ready, because required persisted/auth smoke is still unproven from this evidence set
- treat it as a deployment that may still be operating in fallback/degraded mode until the checklist smoke passes

### 4. Smallest safe next slice

Do not start with more cross-app copy cleanup.

Start with one explicit production-readiness verification pass:

1. verify the Production env matrix in Vercel
2. run authenticated smoke for `/login`, `/settings/areas`, `/capture`, `/triage`, `/calendar`, `/execute`, `/review`, `/health`
3. record which failures are true config/runtime gaps versus which are plain copy debt
4. only then continue with UI trust cleanup, beginning with status vocabulary and diagnostics disclosure

## Manual checks still required outside the repo

- confirm whether the Vercel project marks `life-os-web-azure.vercel.app` as the Production deployment or only as a generated deployment URL
- inspect actual Production environment variables in Vercel
- run the authenticated route smoke from an allowed environment or approved bypass path

## Commands run

Planning-only repo inspection:

- read `README.md`
- read `docs/VERCEL_PRODUCTION_CHECKLIST.md`
- read `.env.example`
- read `docs/PROJECT_STATE.md`

No code, env, secret, deployment, auth, calendar, or runtime changes were made.
