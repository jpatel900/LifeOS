---
name: lifeos-migration-drift-response
description: Use when the Migration Drift workflow is red (production Supabase missing repo migrations) to assemble, review, and apply the fix safely.
---

# lifeos-migration-drift-response

## Overview / purpose

The `Migration Drift` workflow (`.github/workflows/migration-drift.yml`) compares `supabase/migrations/*.sql` versions on `main` against `supabase_migrations.schema_migrations` in production (project `<prod-project-ref>` — get the ref from the Supabase dashboard). Red means production is missing one or more repo migrations: the deployed app may call functions, tables, or columns that do not exist, and the failure mode is usually silent UI breakage (see KNOWN_ISSUES row 11, resolved 2026-07-04). This skill turns the alarm into an applied fix.

## When to use

- The Migration Drift workflow run is red and lists missing migration versions.
- A production smoke or bug points at "works locally, absent in prod" schema behavior.

## Do not use when

- The alarm is a connection failure (`FATAL`/`ENOTFOUND` in the log), not a missing-migrations list — that is a secret/host problem, not drift. Note: this project's shared pooler host is `aws-1-us-east-1.pooler.supabase.com`; `aws-0` fails with "tenant/user not found" for every role.
- You want to create or edit migration content. This skill only applies migrations that already merged to `main`.

## Process

1. Read the failed run log; collect the exact missing versions it printed.
2. For each missing version, read the full file `supabase/migrations/<version>_<name>.sql` from `origin/main` and review it against `AGENTS.md` forbidden changes. Anything touching RLS policies on EXISTING tables, OAuth scopes, calendar write logic, service-role usage, or data deletion needs explicit human sign-off before applying — say so and stop. New-table RLS in an additive migration that already passed PR review is normally fine.
3. Assemble ONE transaction, in version order, verbatim file contents:

   ```sql
   begin;
   -- <contents of each missing migration file, oldest version first>
   insert into supabase_migrations.schema_migrations (version, name, statements)
   values ('<version>', '<name>', array['applied via drift-response runbook <date>']);
   -- (one values row per applied migration)
   commit;
   ```

   The ledger insert is mandatory — it is what `supabase db push` would record and what turns the alarm green. Version = the filename's leading timestamp; name = the filename remainder without `.sql`.

4. Apply it. An agent with production SQL access may execute it ONLY with explicit human authorization for that run (AGENTS.md: production runtime state is human-gated); otherwise hand the assembled SQL to the human to paste into the Supabase SQL Editor (Dashboard → SQL Editor → Run). Equivalent alternative: a human runs `supabase db push` from a linked checkout.
5. Verify: re-run the workflow (`gh workflow run "Migration Drift"`) and confirm the log ends with "Production has all N repo migrations." Spot-check the applied objects (e.g. `select ... from pg_proc / pg_class`) when the migration created functions or tables.
6. If the app already exercised the missing surface in production, check for stranded data the old behavior created (row 11 left tasks stuck in the wrong status) and repair it in the same reviewed session.

## Red flags

- Applying migration content that differs from the file on `main`.
- Skipping the ledger insert (alarm stays red; a later `db push` may double-apply).
- Fixing drift by editing or deleting migration files instead of applying them.
- Applying out of version order, or splitting one migration across transactions.

## Verification

- Migration Drift workflow green after the apply.
- `select max(version) from supabase_migrations.schema_migrations` equals the newest repo migration.

## Done criteria

- All flagged versions applied and recorded in the ledger.
- Workflow re-run green; any stranded-data repair reported with evidence.

## Authority / safety boundaries

- `AGENTS.md` governs: production DDL/data writes require explicit human authorization per run. This skill never authorizes autonomous prod writes.
- Never "fix" red by weakening the workflow, the comparison, or the ledger.
