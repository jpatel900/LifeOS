---
name: lifeos-migration-drift-response
description: Use when the Migration Drift workflow is red — either production Supabase is missing repo migrations, or production has ledger versions with no repo file — to assemble, review, and apply the fix safely.
---

# lifeos-migration-drift-response

## Overview / purpose

The `Migration Drift` workflow (`.github/workflows/migration-drift.yml`, logic in `scripts/agent/check-migration-drift.mjs`) compares `supabase/migrations/*.sql` versions on `main` against `supabase_migrations.schema_migrations` in production (project `<prod-project-ref>` — get the ref from the Supabase dashboard) in BOTH directions:

- **Repo-ahead** ("Production is missing these repo migrations"): the deployed app may call functions, tables, or columns that do not exist, and the failure mode is usually silent UI breakage (see KNOWN_ISSUES row 11, resolved 2026-07-04). This is the original direction — Process A below.
- **Prod-ahead** ("The database has changes this repo has no record of", added 2026-08-21): a version was applied directly to production — by hand, or by another tool — with no matching repo file. Undetected, this is how `20260718184244_security_harden_functions` sat live for a month before an unrelated third-party check noticed (docs/FAILURES.md). This is Process B below.

## When to use

- The Migration Drift workflow run is red and lists missing migration versions (Process A), or unexplained prod-only versions (Process B).
- A production smoke or bug points at "works locally, absent in prod" schema behavior.

## Do not use when

- The alarm is a connection failure (`FATAL`/`ENOTFOUND` in the log), not a missing-migrations list — that is a secret/host problem, not drift. Note: this project's shared pooler host is `aws-1-us-east-1.pooler.supabase.com`; `aws-0` fails with "tenant/user not found" for every role.
- You want to create or edit migration content for a NEW change. This skill only reacts to drift already in production; it does not author new features.

## Process A — repo-ahead (production is missing repo migrations)

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
5. Verify: re-run the workflow (`gh workflow run "Migration Drift"`) and confirm the log ends with "Production has all N repo migrations...". Spot-check the applied objects (e.g. `select ... from pg_proc / pg_class`) when the migration created functions or tables.
6. If the app already exercised the missing surface in production, check for stranded data the old behavior created (row 11 left tasks stuck in the wrong status) and repair it in the same reviewed session.

## Process B — prod-ahead (production has versions with no repo file)

1. Read the failed run log; collect the exact unexplained version(s) and name(s) it printed (e.g. `20260718184244_security_harden_functions`).
2. For each version, decide which case it is — read-only investigation first, via the Supabase MCP (`list_migrations`, `execute_sql` with SELECT only, `get_advisors`) or the dashboard, never a write:
   - **(a) A genuine LifeOS change applied by hand**, with no PR and no file. Recover what it actually did by reading the live objects (function bodies, grants, RLS policies) it must have touched, then write a catch-up migration file — `create or replace` / equivalent — that reproduces the live definition byte-for-byte, so it is idempotent and a no-op if ever replayed. PR #896 (`20260718184244_security_harden_functions.sql`) is the worked example: it explains, in the PR body, exactly how each live object was matched back to what the migration must have done.
   - **(b) A foreign, expected version** — this Supabase project is shared with the RiseUp Cockpit project, which applies its own migrations directly. Add ONE entry to `scripts/agent/migration-drift-allowlist.mjs` with the version, name, and a real, specific one-line reason (not a placeholder, not a prefix/pattern rule — see that file's own header for why a pattern rule is forbidden).
3. Open a normal PR with the catch-up migration file (case a) or the allowlist entry (case b). Either way this is a repo-only change — nothing is applied to production, because the version is (by definition of this direction) already live.
4. Verify: re-run the workflow after merge and confirm it no longer lists that version as unexplained.

## Red flags

- Applying migration content that differs from the file on `main` (Process A).
- Skipping the ledger insert (alarm stays red; a later `db push` may double-apply) (Process A).
- Fixing drift by editing or deleting migration files instead of applying them (Process A).
- Applying out of version order, or splitting one migration across transactions (Process A).
- Adding an allowlist entry (Process B) for a version you have not actually confirmed is foreign or already closed — the allowlist explains known drift, it must never paper over unconfirmed drift.
- Adding a prefix/pattern rule to the allowlist instead of one entry per confirmed version — this silently waves through a future real version that happens to share the prefix.

## Verification

- Migration Drift workflow green after the apply (Process A) or after the catch-up PR / allowlist entry merges (Process B).
- Process A: `select max(version) from supabase_migrations.schema_migrations` equals the newest repo migration.
- Process B: the version no longer appears in the workflow's "unexplained" list.

## Done criteria

- Process A: all flagged versions applied and recorded in the ledger; workflow re-run green; any stranded-data repair reported with evidence.
- Process B: a catch-up migration file or an auditable allowlist entry merged for every flagged version; workflow re-run green.

## Authority / safety boundaries

- `AGENTS.md` governs: production DDL/data writes require explicit human authorization per run. This skill never authorizes autonomous prod writes.
- Never "fix" red by weakening the workflow, the comparison, or the ledger.
