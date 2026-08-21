-- CATCH-UP FILE. This migration is already applied in production (its version
-- is recorded in `supabase_migrations.schema_migrations`) but no file for it
-- ever existed in this repo -- it was applied by hand on 2026-07-18, with no
-- migration file, no PR, and no other git history trace (verified:
-- `git log --all -S "security_harden_functions"` and
-- `git log --all -S "20260718184244"` both return zero commits). This file
-- backfills the repo record so `supabase/migrations/` matches what
-- production has actually had since that date. It mirrors, in reverse, the
-- drift class docs/FAILURES.md already documents ("A merged migration went
-- unapplied for two days") -- there the repo was ahead of prod; here prod was
-- ahead of the repo.
--
-- RECOVERY METHOD (read-only, via the Supabase MCP against the production
-- Supabase project -- no write, branch, or apply was made to reach this
-- file):
--   1. `list_migrations` confirmed version 20260718184244 /
--      "security_harden_functions" is in production's ledger with no
--      matching file anywhere in the repo's git history.
--   2. Enumerated all 17 functions in the `public` schema via
--      `pg_proc`/`pg_get_functiondef` (body + `search_path`) and `proacl`
--      (grants), and cross-referenced every one against the migration file
--      that authored it. 16 of the 17 already carry the `search_path` and
--      grants they have today from the migration that created them (this
--      repo has required `search_path` on new functions since
--      20260612120000, and the trigger functions all share one uniform
--      default ACL that appears identically on functions created both
--      before and after 2026-07-18 -- a platform default, not something this
--      migration touched). The 17th, `rls_auto_enable`, is a platform-level
--      event-trigger function that already had `search_path = pg_catalog`
--      back in the deleted 2026-06-12 remote-schema dump (see
--      docs/FAILURES.md, "Remote schema dump committed as a migration broke
--      local resets") -- it predates and is unrelated to this migration.
--   3. `public.set_updated_at()` is the one function whose live
--      `search_path = ''` is NOT explained by anything in the repo: its only
--      defining migration (20260506213000_create_v1_core_tables.sql, the
--      very first migration) created it with no `search_path` clause at
--      all, and no later migration redefines its body. It is, by
--      elimination, the only function-security state in the database that
--      no repo migration accounts for, and its name and date match this
--      missing migration exactly. This file adds the same `search_path`
--      hardening (the standard fix for Supabase's "Function Search Path
--      Mutable" advisory) to it. The body is untouched -- byte-identical to
--      the original 2026-05-06 definition -- only the search_path clause is
--      new.
--   4. `get_advisors(type: security)` on the live project currently reports
--      zero "Function Search Path Mutable" findings (only an unrelated
--      "Leaked Password Protection Disabled" auth-config warning), which is
--      consistent with the hardening already being in place and holding.
--
-- IDEMPOTENT: `create or replace function` reproduces production's exact
-- current definition, so re-running this against a database that already has
-- it (production does) is a no-op.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
