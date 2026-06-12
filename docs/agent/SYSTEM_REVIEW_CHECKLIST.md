# SYSTEM_REVIEW_CHECKLIST.md

Status: Template for the periodic whole-system review
Cadence: Every ~20 merged PRs or monthly, whichever comes first (AGENTS.md rule). Any agent may run it; output goes to `docs/KNOWN_ISSUES.md`, not to chat.
Why this exists: Per-ticket discipline produces per-ticket quality. Cross-cutting properties (atomicity, data lifecycle, debt, CI truthfulness) decay invisibly unless someone periodically holds the whole system in view. This review is that step.

Keep the review itself token-efficient: sample and grep before reading whole files; report findings as registry rows, not essays.

## 1. Invariant audit (`docs/ENGINEERING_INVARIANTS.md`)

- For each INV: is its enforcement mechanism still present and passing? Run `pnpm --filter @lifeos/web test -- engineeringInvariants`.
- Any new multi-table write sequences outside RPCs? (`grep -n "insert\|update" apps/web/src/lib/data/*.ts` and scan for sequenced dependent writes.)
- Any open INV (status "open") that can now be closed?

## 2. CI-vs-docs drift (INV-6)

- Does every validation the docs claim actually run in `.github/workflows/`? List claims in AGENTS.md §12 / TEST_PLAN.md and diff against CI jobs.
- Is main green on ALL CI jobs right now?

## 3. Requirements coverage

- For each FR in `REQUIREMENTS.md`: shipped / partial / unbuilt. Flag MUST requirements that are partial.
- Any "Do not build" item creeping in?

## 4. Debt and aging

- `docs/KNOWN_ISSUES.md`: any row older than two reviews with no decision? Escalate it in the report.
- Module budget grandfather list: did any ceiling shrink enough to lower? (The guard test reports stale entries.)
- New oversized modules outside the page budget (lib files, components)?

## 5. Data and dependency risk

- New tables since last review: RLS policies? Export coverage? (Guard tests confirm, but check intent.)
- New dependencies or vendors since last review: documented why? Behind an adapter (INV-3)?
- Migrations: do `supabase db reset` + RLS suite pass from scratch?

## Output

Append or update rows in `docs/KNOWN_ISSUES.md` (severity, first-seen date). Note the review date and headline in `PROJECT_STATE.md` "Recently completed". Do NOT fix findings in the same run unless asked — the review is diagnostic.
