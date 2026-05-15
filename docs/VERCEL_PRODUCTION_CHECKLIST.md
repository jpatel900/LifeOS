# Vercel Production Checklist

Use this before pushing a deployment you expect to behave like production instead of Demo mode fallback.

This repo does not have a single production flag. Runtime behavior is enabled per integration.

## 1. Environment variables

Set these in the Vercel project for the Production environment.

### Required for persisted app behavior

These are the minimum vars required to stop the app from falling back to browser-only Demo mode for persisted workflow data.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

What these unlock:

- `/login`
- persisted `/settings/areas`
- durable `/capture` saves
- persisted `/triage` accepts
- persisted `/calendar` proposals
- persisted `/execute` sessions
- persisted `/review` entries
- persisted `/health` data-backed checks

If either is missing:

- the app truthfully degrades to Demo mode on the affected surfaces

### Required for Google Calendar integration

- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

What these unlock:

- Google Calendar connect/disconnect
- Google free/busy checks
- approval-gated Google Calendar event creation

If any are missing:

- Google Calendar remains unavailable
- local planning still works
- no external write should happen

### Required for AI capture sorting

- `OPENAI_API_KEY`
- one of:
  - `AI_MODEL_STANDARD`
  - `AI_MODEL_CHEAP`
  - `AI_MODEL_STRONG`

Recommended:

- `AI_MODEL_STANDARD` for the main parser path
- leave `AI_PARSE_CAPTURE_ENABLED=true` or unset it

If `AI_PARSE_CAPTURE_ENABLED=false`:

- AI capture sorting is intentionally disabled
- `/capture` falls back to Demo mode sorting

If `OPENAI_API_KEY` or all model tier vars are missing:

- `/capture` falls back to Demo mode sorting

### Optional observability

Sentry:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`

PostHog:

- `NEXT_PUBLIC_POSTHOG_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

Langfuse:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

If these are missing:

- the app should still run
- `/health` should show optional-disabled or unconfigured observability states, not core workflow failure

## 2. Pre-push sanity checks

Before relying on Vercel autodeploy:

- confirm the Vercel Production environment has the required vars above
- confirm `GOOGLE_REDIRECT_URI` points at the deployed callback route, not localhost
- confirm secrets are server-only where required:
  - never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`
  - never put Google secrets in `NEXT_PUBLIC_*`
  - never put OpenAI keys in `NEXT_PUBLIC_*`
  - never put Langfuse secrets in `NEXT_PUBLIC_*`
- confirm the Google OAuth consent screen/scopes match the shipped flow

## 3. Production smoke checklist

Run this after the Production deployment finishes.

### Stage 1: auth and persistence

1. Open `/login`.
2. Sign in with a real production user.
3. Open `/settings/areas`.
4. Confirm areas load from persisted storage instead of Demo mode.

Expected:

- login works
- no Supabase config error
- storage mode surfaces should no longer imply browser-only fallback for persisted flows

### Stage 2: capture and triage

1. Open `/capture`.
2. Save one short thought with `Save thought`.
3. Use `Save and organize`.
4. Open `/triage`.
5. Confirm drafts are reviewable and can be accepted.

Expected:

- raw capture saves successfully
- if AI is configured, sorting should use AI
- if AI is intentionally disabled/unconfigured, fallback should be explicit and safe
- accepted task/project creation should persist

Failure signals:

- capture save fails
- AI errors leak raw provider/internal messages
- accepted drafts disappear instead of persisting

### Stage 3: planning without external write

1. Open `/calendar`.
2. Create or adjust a local proposal from a persisted task.
3. Confirm local planning works before any Google action.

Expected:

- proposal creation works without requiring Google
- approval gate remains explicit
- no external write occurs automatically

### Stage 4: Google connection and advisory checks

Only do this if Google env vars are configured.

1. In `/settings/areas`, connect Google Calendar.
2. Return to `/calendar`.
3. Run a conflict/free-busy check on a persisted proposal.

Expected:

- connect succeeds
- disconnect remains available
- conflict status updates safely
- failure does not delete or corrupt the local proposal

### Stage 5: explicit Google write

Only do this against a low-risk test calendar first.

1. Start from a persisted local proposal.
2. Acknowledge the approval step if prompted.
3. Click `Create Google Calendar event`.

Expected:

- one external event is created
- duplicate creation is blocked
- failure remains visible and local state is preserved
- write remains explicit user-driven, never automatic

### Stage 6: execute, review, health

1. Open `/execute`.
2. Start a persisted session.
3. End it with a real terminal outcome.
4. Open `/review` and create a review entry.
5. Open `/health`.

Expected:

- persisted session start works
- end outcome requires explicit details in persisted mode
- `/execute` does not fake a live timer
- review persists
- `/health` distinguishes optional-disabled states from real failures

## 4. Known non-issues that are easy to misread

These are not deployment bugs by themselves:

- Demo mode copy still exists in the repo
- mock/demo fallback code still exists
- observability providers are absent
- persisted `/execute` does not expose a fake live timer
- Google write actions stay disabled until prerequisites are satisfied

## 5. Stop-ship failures

Do not treat the deployment as production-ready if any of these happen:

- login fails with Supabase configured
- persisted capture/task/proposal/session/review writes fail
- raw capture is lost when AI sorting fails
- Google Calendar writes happen without explicit approval
- failed Google writes mark a block as scheduled
- service-role or provider secrets appear in client-visible output
- `/health` hides real auth/data-read failure behind misleading healthy copy

## 6. Fast rollback

If the deployment is bad:

1. Remove or correct the bad Vercel env values.
2. Redeploy the last known-good commit or promote the previous good deployment.
3. Re-run Stage 1 and Stage 6 first.
