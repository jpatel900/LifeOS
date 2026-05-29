# 2026-05-28 planning calendar clarity

## Scope

Resolve issue `#87` by clarifying `/calendar` planning states and Google Calendar affordances without changing approval-gated write behavior or any server-side calendar capability.

## What changed

- Renamed the primary Planning sections to `Needs time`, `Suggested time blocks`, and `Planned blocks`.
- Replaced raw conflict/proposal wording with plain-language state labels such as `Calendar not checked`, `Calendar looks open`, and `Calendar conflict found`.
- Replaced raw primary-surface proposal-status leakage with user-facing planning state and Google Calendar status lines.
- Moved Google Calendar controls behind a secondary `Google Calendar options` disclosure unless connection state or prior checks make them directly relevant.
- Reworded disabled reasons so they explain what the user needs to do next without leaking `Supabase` or proposal-status internals into primary workflow copy.
- Removed the brittle client-side “post-write confirmation” branch that could incorrectly show a Google-write failure after the server had already returned a successful event creation response.

## Constraints kept

- No new Google Calendar write capability.
- No OAuth scope changes.
- No service-role changes.
- No schema, migration, or RLS changes.
- No automatic conflict checks or automatic external writes.

## Validation

- `pnpm --filter @lifeos/web test -- phase4aPersistence.test.tsx sourceOfTruth.test.ts routeSmoke.test.tsx`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web build`
