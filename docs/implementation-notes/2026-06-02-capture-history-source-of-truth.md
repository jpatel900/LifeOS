# 2026-06-02 Capture History Source Of Truth

## Scope

Issue `#123` only.

## Decision

Capture now shows two separate recent-history surfaces instead of one ambiguous list:

- `Recent saved captures` / `Recent saved captures on this device`
- `Recent captures organized on this device`

This keeps durable saved rows separate from the local draft-only organize flow.

## Implementation notes

- Saved history loads from `listCaptureItems` when the provider is Supabase.
- Saved history is updated immediately after `Save thought` and `Save and organize` so the saved capture appears in the expected surface without a full reload.
- Device-only organized captures still come from workflow context `state.captureItems`.
- Area filtering now matches both workflow area ids and persisted area ids so seeded areas (`main-job` -> `area-main-job` vs persisted UUID) and custom areas both filter correctly.

## Proof

- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test -- capture routeSmoke workflowAreaAccent phase4aPersistence sourceOfTruth`
- `pnpm --filter @lifeos/web build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`
