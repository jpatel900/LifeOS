---
name: lifeos-supabase-rls
description: Use for LifeOS Supabase, migrations, RLS, tables, grants, indexes, persistence work, same-user constraints, and local RLS validation.
---

# lifeos-supabase-rls

## Use when

- Adding or changing Supabase tables, migrations, grants, constraints, or indexes.
- Touching RLS-sensitive persistence paths.
- Auditing same-user ownership guarantees.

## Do not use when

- Work is purely UI with no database or auth-bound persistence surface.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Never disable RLS.
- Avoid schema changes unless they are explicitly scoped and approved.
- Do not leak service-role keys or broaden authenticated grants unnecessarily.

## Procedure

1. Enforce `user_id` ownership and RLS on every user-owned table.
2. Never disable RLS to make behavior pass.
3. Keep same-user constraints and ownership checks explicit.
4. Use authenticated Data API grants narrowly to the minimum needed tables/actions.
5. Avoid service-role leakage in browser/client paths.
6. When DB or RLS surfaces change, run local RLS tests with at least two users.
7. Report any grant or policy risk and keep changes minimal and reversible.

## Done criteria

- User ownership and RLS requirements are preserved.
- Same-user isolation remains intact.
- Grants are narrow.
- Two-user RLS test expectations are covered when relevant.
