# 2026-06-03 Playwright Route Warmup

## Problem

`pnpm --filter @lifeos/web test:e2e` could intermittently fail on this Windows + OneDrive workspace even when the app itself was fine.

Observed failure mode:

- Next dev was marked "ready" after `/` responded.
- The first browser navigation into cold routes like `/capture`, `/triage`, `/execute`, or `/health` could still hit transient compile-time `404` or `net::ERR_ABORTED`.
- Screenshots showed the AppShell plus the route-highlighted nav state wrapped around the Next `404` surface, which made the failures look like runtime regressions even when the underlying route existed.

## Root cause

The Playwright wrapper only waited for `/` before starting browser tests.

In this workspace, cold on-demand route compilation under Next dev was not stable enough to treat "root route is ready" as "all workflow routes are ready". The problem was amplified by noisy webpack cache restore/write warnings under `.next/cache` in the OneDrive-backed workspace, but the visible test failures were route-warmup failures, not confirmed product regressions.

## Fix

Updated `scripts/run-playwright-e2e.mjs` to prewarm the core workflow routes before Playwright starts:

- `/`
- `/capture`
- `/triage`
- `/calendar`
- `/execute`
- `/review`
- `/settings/areas`
- `/health`
- `/api/parse-capture`

The wrapper now waits for each warm route to return a successful response before starting browser tests.

Also aligned `tests/e2e/p0-ux-regression.spec.ts` with the shipped UI:

- `gotoCapture` retries once before failing if the first cold navigation lands on a transient shell-wrapped `404`
- save-and-organize waits for the actual parse `POST /api/parse-capture` response plus the `Drafts ready for Triage.` state
- the Home route test follows the dominant `Review in Triage` CTA instead of a less stable secondary path

## Validation

Passed after the warmup fix:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`

## Remaining note

Webpack cache warnings under `.next/cache` can still appear in this workspace, but with route warmup in place they no longer translated into the observed browser-proof route aborts during this pass.
