# 2026-06-26 LifeOS Handoff Cockpit

Purpose: Implement the `design_handoff_lifeos/` cockpit as the active workflow UI and retire old Pass 7 visual contracts.

## What changed

- Workflow routes now render through one `LifeOSCockpit` stage router via thin `CockpitRoute` aliases.
- `AppShell` is reduced to provider/admin shell responsibility; settings/admin stays outside the cockpit.
- Handoff tokens and exact accent derivation are active in the cockpit root, with dark default and light through `data-theme="light"`.
- Added `backlog` task status for Someday/later and a migration updating the `tasks_status_check` constraint.
- Area creation accepts an optional palette color so new areas can persist a base accent.
- The cockpit now hydrates authenticated Supabase workflow rows into the `WorkflowProvider` state model and best-effort persists raw capture, Do today/Someday triage, hour-rail planning, session starts, and session outcomes through existing data helpers.
- Old Pass 7 UI control-plane docs moved to `docs/archive/ui-ux/pass-7/`; `docs/UI_UX_WORLD_CLASS_ROADMAP.md` and `docs/agent/UI_AGENT_GUIDE.md` now point to the handoff pass.

## Safety boundaries preserved

- Capture still uses one `Save thought` primary action and routes saved thoughts to Triage.
- Google Calendar writes are not performed by the hour rail; the cockpit keeps external writes behind a secondary approval disclosure.
- Settings/admin and export-related surfaces remain outside the cockpit.
- Parser, Google Calendar, service-role, and observability guard tests remain in the source-of-truth suite.

## Validation

- `pnpm --filter @lifeos/schemas test`
- `pnpm --filter @lifeos/web test`
- `pnpm --filter @lifeos/web type-check`
- `pnpm --filter @lifeos/web lint`
- `pnpm --filter @lifeos/web build`

## Recheck

- Local Supabase was reset with the new migration applied, including `20260626120000_add_task_backlog_status.sql`.
- `RUN_SUPABASE_RLS_TESTS=1 pnpm --filter @lifeos/web test -- phase4aRls.local` passed with 17 tests.
- Root `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build` passed.
- `pnpm format:check` still fails on broad pre-existing repository formatting drift outside this cockpit pass; do not treat it as evidence against the handoff UI change.
- Screenshot review caught and fixed a mobile header polish issue where the theme icon wrapped awkwardly and the area chip row clipped long labels.
- Contract review caught and fixed a header persistence edge: newly added areas now refresh from `listAreas` after `createArea`, so recoloring the newly added area can use the persisted id in the same session.
- Old Pass 7 Playwright specs were replaced with focused handoff cockpit E2E specs.
- `pnpm --filter @lifeos/web test:e2e` passed with 9 tests covering the cockpit route sweep, desktop/mobile screenshots, dark/light theme toggle, Capture, Triage, Plan, Execute, Review, Health, and Areas admin.
- Browser evidence for the handoff pass now lives under `apps/web/test-results/handoff-cockpit/`.
- Added persistence bridge proof: `pnpm --filter @lifeos/web test -- WorkflowContext.areas workflow.test phase4aPersistence`, `pnpm --filter @lifeos/schemas test`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web lint`, and local Supabase `RUN_SUPABASE_RLS_TESTS=1 pnpm --filter @lifeos/web test -- phase4aRls.local` all passed.

## Remaining follow-up

- Manual proposal create/edit/reject, unplanning, carry-forward review actions, and account-sync retry queues remain local/session-only unless a follow-up persistence slice is opened.
