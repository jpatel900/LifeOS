# 2026-06-05 Home, Review, Areas, and Shell Polish Pass

## Scope

This pass stayed inside shipped UI composition and proof surfaces:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/components/AppShell.tsx`
- `apps/web/src/app/review/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/health/page.tsx`
- targeted Vitest and E2E proof updates only

No schema, migration, auth, parser, calendar-write approval, or persistence contract changed.

## What changed

- Home is now strictly read-only again. Route-local quick capture was removed, starter route duplication was reduced, and the empty-state loop now supports the primary `Capture a thought` CTA instead of competing with it.
- The shell no longer exposes quick-note mutation on `/`, which keeps Home honest while preserving quick-note capture on workflow routes.
- Shell diagnostics now keep only the quick-capture truth statement instead of repeating current-area and technical-id detail that was already visible elsewhere.
- Review now keeps daily closure, carry-forward actions, and the at-a-glance summary visible first, while reflection notes, counts, area backlog, and history move behind calmer disclosures.
- Areas now keeps area creation plus the immediate `Use this area` / `Capture here` actions visible, while accent controls, route extras, diagnostics, destructive actions, Google connection detail, and local reset all move behind quieter disclosures.
- Triage no longer renders a duplicate `Current focus` CTA when the queue is empty.
- Planning empty state no longer repeats the same CTA that already exists in the primary `Planning flow` surface.
- Health no longer renders a second green success block when the healthy-state summary is already visible.
- Capture now demotes the device-only draft pass and device-only organized-capture history behind quieter disclosures so the writing surface and saved-history truth stay primary.
- Execute now removes the redundant `What Execute is for` card from the empty state, folds the purpose into the fallback CTA copy, renames detail surfaces more intentionally, and keeps recovery/session detail secondary instead of parallel to the mission.
- Route-level diagnostics now use route-specific disclosure labels (`Today details`, `Capture details`, `Planning details`, etc.) instead of repeating the same generic label everywhere.

## Why this pass

The app was already visually stronger than the earlier declutter passes, but still over-explained itself on first render. The goal here was subtraction, not decoration: one obvious move first, support detail second, and no silent weakening of truthfulness or approval gates.

## Proof

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

## Risk

Low to medium. The main regression risk was stale proof that assumed duplicate empty-state CTAs or duplicate healthy-state success feedback. Those expectations were updated to the stricter current UX contract.
