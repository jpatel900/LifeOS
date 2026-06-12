# 2026-06-12 — Agent-governance hardening

Status: Implemented on `feat/governance-hardening`
Why: Root-cause analysis of the robustness gaps found 2026-06-12 showed the failures were process-shaped: governance encoded refusals but not positive guarantees, per-ticket criteria missed cross-cutting properties, CI enforced less than the docs claimed, debt had no sanctioned paydown channel, and known issues had no aging rule.

## Changes

- **`docs/ENGINEERING_INVARIANTS.md`** (new authority doc, added to README/AGENTS/CLAUDE authority lists): INV-1 atomic multi-table transitions, INV-2 export coverage, INV-3 vendor seams, INV-4 module budgets, INV-5 degradation visibility (open), INV-6 CI tells the truth.
- **`apps/web/src/__tests__/engineeringInvariants.test.ts`**: static guards for INV-2/3/4 (migration-parsing export coverage, vendor hostname boundaries, page line budgets with a shrink-only grandfather list). Bite-proven by seeding violations (all three failed, then green after revert).
- **CI (`.github/workflows/ci.yml`)**: new `e2e` job (full Playwright suite, msedge, traces on failure) and `migrations-rls` job (`supabase start` → `db reset` → live RLS suite).
- **`docs/KNOWN_ISSUES.md`** (new registry, seeded with 8 rows) + aging rule; **`docs/agent/SYSTEM_REVIEW_CHECKLIST.md`** (periodic whole-system review, ~20 PRs or monthly).
- **AGENTS.md**: §12B robustness requirements, §12C aging + review cadence, §17 rule 3 amended with the sanctioned debt-paydown channel, §6A token-economy rules.
- Cross-cutting one-liners added to `VALIDATION_MATRIX.md`, `next-phase-gate-review.md`, `CODEX_PROMPT_TEMPLATE.md` (Verification Oracle now names touched invariants). `TEST_PLAN.md` gained invariants 11–12 and RPC RLS test requirements. `REPO_MAP.json`/`CONTEXT_INDEX.md` route the invariants doc into relevant areas.
- **Phase 0 fixes**: `areas-color-edit.spec.ts` repaired (opens the Pass 7 disclosure; was failing on clean main), and two-user RLS denial tests added for both transactional RPCs.

## Proof

- Migration verified live: `supabase db reset` clean; RLS suite 17/17 (includes new RPC tests).
- `areas-color-edit.spec.ts` 3/3; invariant guards 4/4 and bite-proven.
- Full validation rerun at batch end (see PR).

## Limitations

- CI jobs are authored but unproven until a PR runs them on GitHub.
- Untracked `supabase/migrations/20260612231853_remote_schema.sql` (remote drift dump, created outside this work) breaks local `db reset` while present; left uncommitted for a human decision (KNOWN_ISSUES #7).
- INV-5 (degradation → Health) is documented as open, not implemented.
