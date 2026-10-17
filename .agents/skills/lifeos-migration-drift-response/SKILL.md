---
name: lifeos-migration-drift-response
description: Use when the Migration Drift workflow is red — either production Supabase is missing repo migrations, or production has ledger versions with no repo file — to assemble, review, and apply the fix safely.
---

# lifeos-migration-drift-response

`Migration Drift` (`.github/workflows/migration-drift.yml`, logic in `scripts/agent/check-migration-drift.mjs`) compares `supabase/migrations/*.sql` on `main` with production's `supabase_migrations.schema_migrations`, in both directions. The failing log already says which direction and lists the versions.

- **Connection failure, not drift:** `FATAL`/`ENOTFOUND` in the log is a secret/host problem. This project's shared pooler host is `aws-1-us-east-1.pooler.supabase.com`; `aws-0` fails with "tenant/user not found" for every role.
- **Production writes need human authorization for each run.** Agents never apply DDL or write prod data themselves (`AGENTS.md` "Operational red lines"). Read-only investigation (Supabase MCP `list_migrations`, `execute_sql` with SELECT only, `get_advisors`) is fine.

## Repo-ahead: production is missing repo migrations

- Normal path: `.github/workflows/migration-apply.yml` auto-applies additive migrations after merge (it halts on destructive statements and is inert without its migrator secret). Drift that persists means that workflow skipped, halted, or failed: read its run first.
- Manual path: `pnpm drift:assemble` writes the single version-ordered transaction, ledger inserts included. Never apply content that differs from the files on `main`, never skip the ledger insert, never split one migration across transactions, and never "fix" drift by editing or deleting migration files. The owner applies it (SQL Editor or `supabase db push` from a linked checkout).
- Anything touching RLS on existing tables, OAuth scopes, calendar writes, service-role usage, or data deletion is on the Human review list: you may prepare the apply; declare it as an `OWNER-GATE`.
- Verify by re-running the workflow; check for stranded data the missing surface may have caused (KNOWN_ISSUES row 11 left tasks stuck in the wrong status).

## Prod-ahead: production has versions with no repo file

- **(a) A LifeOS change applied by hand:** read the live objects it touched and write a catch-up migration that reproduces them byte-for-byte (`create or replace`), so a replay is a no-op. Worked example: PR #896.
- **(b) A foreign version:** this Supabase project is shared with the RiseUp Cockpit project. Add exactly one entry per confirmed version to `scripts/agent/migration-drift-allowlist.mjs` with a specific reason, never a prefix or pattern rule, and never for a version you have not confirmed.
- Either way the fix is a repo-only PR; re-run the workflow after merge.
