# PROJECT_STATE.md

## Current status

MVP supports task capture, area assignment, and manual scheduling through the Phase 2 mock vertical slice. Phase 4A now has Supabase-backed persistence for areas and raw capture items while keeping mock mode when Supabase env vars are missing.

## Recently completed

- Task CRUD
- Area model
- Basic calendar draft creation
- Added always-on Cursor execution discipline rule for phase gating, plugin restrictions, mock preservation, schema strictness, required validation commands, and final risk/file summary expectations
- Refined plugin policy: strict no-plugin compliance when a prompt forbids plugins; otherwise plugins are allowed when appropriate to task and phase
- Added completion proof requirement for agent work: final handoff must show changed files, tests run, limitations, and docs-updated status
- Added local Supabase scaffold with `supabase/config.toml`, initial V1 schema migration, RLS policies, and seed guidance
- Added a migration contract test that checks required Phase 3 tables, RLS policies, and index coverage
- Added Supabase browser/server client helpers, provider-aware data functions, and `/settings/areas` plus `/capture` pages for Phase 4A
- Updated shared Zod schemas to validate Phase 4A `areas` and `capture_items` rows at app boundaries
- Added local Supabase seed data for two Auth users and starter areas, plus a local login page for RLS-backed Phase 4A smoke tests

## Known issues

- Rescheduling does not yet check all-day events.
- Mobile layout needs improvement.
- Supabase is scaffolded locally and Phase 4A UI can use it for areas/capture, but tasks, projects, proposals, calendar blocks, and review flows are not wired to Supabase yet.
- Supabase-backed capture saves require an authenticated Supabase user because RLS policies enforce `auth.uid() = user_id`.

## Next recommended tasks

1. Manually smoke `/login` with `user_a@example.test` / `password123`, then verify `/settings/areas` reads three areas and `/capture` saves a raw capture.
2. Add focused two-user RLS integration tests using seeded `user_a@example.test` and `user_b@example.test`.
3. Add conflict detection tests.
4. Improve mobile task capture.

## Important implementation notes

- Task status and TimeBlock status are separate.
- Calendar events are never auto-deleted without confirmation.
- Agent guidance is now aligned across `AGENTS.md` and `.cursor/rules/execution-discipline.mdc` for phase-first implementation and completion checks.
- Phase 3 migration covers only the requested V1 tables: areas, capture items, projects, tasks, proposals, calendar blocks, execution sessions, review entries, health checks/incidents, suggestion records, and override records.
- RLS policies use `to authenticated` and `((select auth.uid()) = user_id)`; area/project/task references use same-user composite foreign keys to reduce cross-user contamination risk.
- Phase 4A data access falls back to mock data when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing.
- Phase 4A does not add OpenAI, Google Calendar, Edge Functions, task persistence, or proposal persistence.
- Local Supabase seed users both use password `password123`; User A has Main Job, Personal, and Volunteer Work areas, while User B has a private area for RLS isolation checks.
- `supabase db reset` has been verified locally after the seed update.
