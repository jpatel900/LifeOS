# Observability Runbook

## Purpose

Phase 8 observability exists to debug LifeOS without turning a private workflow vault into surveillance. Observability must stay optional, minimal, scrubbed, and non-blocking.

## Architecture Summary

- `apps/web/src/lib/observability/*` is the shared source of truth.
- App code uses only `captureError`, `captureEvent`, and `traceParseCapture` from the shared wrapper.
- Root bootstrap files initialize vendor SDKs only when their env vars are configured:
  - `apps/web/sentry.server.config.ts`
  - `apps/web/sentry.edge.config.ts`
  - `apps/web/instrumentation-client.ts`
  - `apps/web/langfuse.server.config.ts`
- Missing provider env vars must degrade to no-op behavior.
- `/health` reports provider readiness and privacy guardrails using deterministic code only.

## Source-Of-Truth Rule

- Do not call Sentry, PostHog, or Langfuse directly from `apps/web/src`.
- Do not bypass the shared scrubbers or allowlists.
- Do not add new telemetry call sites without first routing them through `@/lib/observability`.
- Request errors must also use the shared wrapper with minimal context only.

## Provider Responsibilities

### Sentry

- Sanitized error capture only.
- No replay.
- No `sendDefaultPii`.
- No tracing sampling in this phase.
- No source-map upload requirement in this phase.

### PostHog

- Manual workflow events only.
- No autocapture.
- No session recording.
- No replay, heatmaps, dead-click capture, console-log capture, or broad pageview capture.
- No identify calls with personal identity data.

### Langfuse

- Server-only `parse_capture` tracing only.
- Metadata-only generations.
- No prompt export.
- No completion export.
- No parsed body export.

## Env Vars

### Public

- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

### Server-Only

- `SENTRY_DSN`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

Never move Langfuse keys, Supabase service-role keys, Google OAuth secrets, or OpenAI keys into `NEXT_PUBLIC_*`.

## Safe Defaults

- All providers absent: app still works, wrapper no-ops, mock mode still works.
- Sentry initializes only when DSN config is complete.
- PostHog initializes only when public host and token are both present.
- Langfuse initializes only on the Node runtime when all server-only vars are present.
- Health output shows provider state, missing/invalid key counts, and safe transport metadata only.

## Production Sampling Defaults

- Sentry:
  - `sendDefaultPii: false`
  - `tracesSampleRate: 0`
  - `replaysSessionSampleRate: 0`
  - `replaysOnErrorSampleRate: 0`
  - `beforeBreadcrumb: () => null`
  - `beforeSend: sanitizeSentryEvent`
- PostHog:
  - `autocapture: false`
  - `capture_pageview: false`
  - `capture_pageleave: false`
  - `capture_dead_clicks: false`
  - `capture_heatmaps: false`
  - `capture_exceptions: false`
  - `disable_session_recording: true`
  - `logs.captureConsoleLogs: false`
- Langfuse:
  - manual metadata-only `parse_capture` generations
  - no prompt/completion wrapper
  - token/cost fields only when safely available

## Provider Enablement Order

1. Shared wrapper only
2. Sentry
3. PostHog
4. Langfuse

Reason: Sentry gives the lowest-risk operational signal first. PostHog is still manual-only but client-facing. Langfuse is server-only and parser-specific.

## Provider Disable Procedure

1. Unset the provider env vars.
2. Rebuild/redeploy.
3. Confirm `/health` reports the provider as `disabled`.
4. Confirm wrapper calls no-op without affecting workflow behavior.

No database rollback is required. Phase 8 observability adds no schema changes.

## Health Dashboard Interpretation

- `disabled`: provider env vars absent; this is acceptable and should not block local/mock mode.
- `missing_config`: partial env config present; provider should be treated as not enabled.
- `invalid_config`: malformed URL/host config; provider should be treated as not enabled.
- `configured`: provider env vars are complete and syntactically valid.

The `Observability privacy` row must only expose:

- whether any vendor telemetry is active
- whether replay/autocapture/AI content tracing are disabled
- active provider names
- active transport modes

It must never expose raw DSNs, tokens, keys, cookies, auth headers, or payload contents.

## What Must Never Be Logged, Tracked, Or Traced

- raw capture text
- raw audio
- AI prompts
- AI completions
- parsed task/project/proposal bodies
- task/project/proposal titles or descriptions
- Google Calendar event titles or descriptions
- Google OAuth tokens
- OpenAI API keys
- Supabase service-role keys
- Supabase access or refresh tokens
- cookies
- `Authorization` headers
- request bodies containing private content

## Manual Smoke Plan

Provider-state matrix:

1. all providers absent
2. Sentry only
3. PostHog only
4. Langfuse only
5. Sentry + PostHog
6. Sentry + Langfuse
7. PostHog + Langfuse
8. all providers enabled

For each state verify:

- `pnpm build` succeeds.
- app starts.
- `/health` renders and reports the expected provider states.
- missing provider config is non-blocking.
- no secrets appear in UI, logs, or health output.
- mock parser fallback still works.

Specific smoke checks:

- Trigger a safe test error and verify Sentry receives only scrubbed payload fields.
- Trigger one approved manual workflow event and verify PostHog receives only allowlisted metadata.
- Run `parse_capture` and verify Langfuse receives metadata only:
  - `operation`
  - `model_tier_label`
  - `model_name` when safe
  - `schema_version`
  - `prompt_version`
  - `status`
  - `validation_status`
  - `latency_ms`
  - token/cost metrics only when available
- Verify no raw input or raw output appears in Langfuse.
- Verify no raw capture text appears in Sentry or PostHog payloads.
- Verify no calendar token or calendar event content appears in any provider payload.
- Verify browser bundles contain no server-only observability secrets.
- Verify disabling any provider returns the wrapper to no-op behavior.

## Postgres AI Call Traces (issue #288)

`ai_call_traces` records one metadata-only row per real AI call: `surface`,
`prompt_version`, `model`, `input_tokens`, `output_tokens`, `latency_ms`,
`validation_outcome`, and `created_at`. It never stores raw prompt or response
bodies — raw content stays in the existing capture tables (privacy doctrine).
The table is owner-scoped by RLS, so these queries run under the signed-in
user's own rows (for example in the Supabase SQL editor).

Use these snippets for Langfuse-class cost/latency/failure-rate visibility per
surface per week without adding a new vendor.

### Token volume per surface per week (cost proxy)

```sql
select
  date_trunc('week', created_at) as week,
  surface,
  count(*) as calls,
  sum(coalesce(input_tokens, 0)) as input_tokens,
  sum(coalesce(output_tokens, 0)) as output_tokens
from public.ai_call_traces
where created_at >= now() - interval '8 weeks'
group by 1, 2
order by 1 desc, 2;
```

### Latency per surface per week (p50 / p95 / max)

```sql
select
  date_trunc('week', created_at) as week,
  surface,
  count(*) as calls,
  percentile_disc(0.5) within group (order by latency_ms) as p50_ms,
  percentile_disc(0.95) within group (order by latency_ms) as p95_ms,
  max(latency_ms) as max_ms
from public.ai_call_traces
where created_at >= now() - interval '8 weeks'
group by 1, 2
order by 1 desc, 2;
```

### Failure rate per surface per week

`validation_outcome` is one of `passed`, `schema_failed`, `retried`, `failed`.
Anything other than `passed` counts as a non-clean outcome here.

```sql
select
  date_trunc('week', created_at) as week,
  surface,
  count(*) as calls,
  count(*) filter (where validation_outcome <> 'passed') as failures,
  round(
    100.0 * count(*) filter (where validation_outcome <> 'passed') / count(*),
    1
  ) as failure_rate_pct
from public.ai_call_traces
where created_at >= now() - interval '8 weeks'
group by 1, 2
order by 1 desc, 2;
```

## Troubleshooting

- Provider shows `missing_config`:
  - one or more required env vars are absent
  - fix env completeness, then rebuild
- Provider shows `invalid_config`:
  - host/DSN/base URL is malformed
  - fix the URL, then rebuild
- Provider shows `configured` but no events arrive:
  - confirm the root bootstrap file for that provider is still present
  - confirm the shared wrapper call site exists
  - confirm the event is in the approved taxonomy for PostHog
  - confirm Langfuse traces are only emitted from `parse_capture`
- Health output looks misleading:
  - check `active_providers` and `active_transport_modes`
  - check whether the provider row says `disabled`, `missing_config`, `invalid_config`, or `configured`

## Rollback

Fast rollback:

1. unset provider env vars
2. rebuild/redeploy
3. confirm `/health` returns to `disabled`

Code rollback if needed:

1. revert the Phase 8 observability files on the current branch
2. rebuild
3. rerun `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build`

## Pipeline Kill Switch

When the autonomous pipeline misbehaves (loops, runaway spend, bad merges), pause the
autonomous half immediately while keeping CI and the Main Red Guard alive:

```
gh workflow disable pipeline-advance.yml
gh workflow disable codex-ci-autofix.yml
gh workflow disable codex-low-risk-issue-to-pr.yml
gh workflow disable codex-issue-plan.yml
```

Re-enable with `gh workflow enable <file>` once the cause is understood. Never disable
`ci.yml`, `main-red-guard.yml`, or `safe-automerge.yml` as a first response — they are
the safety net, not the actor.

Repo visibility note: switching the repo private/public DELETES branch protection on
the Free plan (verified 2026-07-04). Going private requires GitHub Pro first, and the
protection must be re-created immediately after any visibility change:

```
gh api -X PUT repos/jpatel900/LifeOS/branches/main/protection --input protection.json
# strict=false; contexts: Monorepo Validation, Playwright E2E, Migrations + RLS Verification;
# linear history + conversation resolution on; force pushes/deletions off.
```
