---
name: lifeos-supabase-rls
description: Use for LifeOS Supabase, migrations, RLS, tables, grants, indexes, persistence work, same-user constraints, and local RLS validation.
---

# lifeos-supabase-rls

The table and transaction red lines in `AGENTS.md` and INV-1/INV-2 govern. LifeOS-specific facts:

- **New user-owned table:** `id`, `user_id`, timestamps, RLS enabled with select/insert/update/delete-or-archive policies, indexes, and an entry in `USER_DATA_EXPORT_TABLES` (`apps/web/src/lib/data/export.ts`) in the same PR. Area-scoped tables carry `area_id`. Extend the shared mock Supabase client in the same PR (`lifeos-testing`).
- **No PostgreSQL enums** for user-expandable values such as area names.
- **Multi-table transitions** go through one `SECURITY INVOKER` RPC; pattern: `supabase/migrations/20260612120000_add_workflow_transition_functions.sql`, callers in `apps/web/src/lib/data/workflow.ts`.
- **Grants** stay narrow to the tables and actions needed; service-role usage stays server-only and justified.
- **Migrations are additive within an epic** (NS-INV-2) and must survive a local `supabase db reset`; never commit a remote schema dump as a migration.
- **Proof:** `RUN_SUPABASE_RLS_TESTS=1` with env from `supabase status -o env`, covering the two-user isolation case (`apps/web/src/__tests__/phase4aRls.local.test.ts`). Mock-green `pnpm test` proves nothing about RLS.
