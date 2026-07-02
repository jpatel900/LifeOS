---
name: lifeos-supabase-rls
description: Use for LifeOS Supabase, migrations, RLS, tables, grants, indexes, persistence work, same-user constraints, and local RLS validation.
---

# lifeos-supabase-rls

## Use when

- Adding or changing Supabase tables, migrations, grants, constraints, indexes, RLS-sensitive persistence paths, or same-user ownership guarantees.

## Boundaries

- `AGENTS.md`, authority docs, and direct instructions override this skill.
- Never disable or weaken RLS to make behavior pass.
- Avoid schema changes unless explicitly scoped and approved.
- Do not leak service-role keys or broaden authenticated grants unnecessarily.
- Do not use PostgreSQL enums for user-expandable values such as area names.

## Table requirements

Every user-owned table needs `id`, `user_id`, timestamps where appropriate, RLS enabled, select/insert/update/delete-or-archive policies, relevant indexes, and export coverage in `USER_DATA_EXPORT_TABLES`. Area-scoped tables include `area_id`.

## Procedure

1. Enforce `user_id` ownership and same-user constraints on every user-owned path.
2. For multi-table persisted transitions, use one transactional `SECURITY INVOKER` server boundary/RPC instead of sequenced client writes.
3. Use authenticated Data API grants narrowly to the minimum needed tables/actions.
4. Keep service-role usage server-only and narrowly justified.
5. When DB/RLS surfaces change, run local Supabase reset and two-user RLS tests.
6. Report any grant/policy risk and keep changes minimal and reversible.

## Done criteria

- User ownership, RLS, policies, indexes, and export coverage are present.
- Same-user isolation remains intact.
- Grants are narrow and service-role usage is not exposed to browser code.
- Two-user RLS expectations are covered when relevant.
