> **This is the single, authoritative, rolling cold-start handover for LifeOS.**
> It is **overwritten** at the end of every session — git history preserves
> every prior version, so there is no need to keep dated copies. This file
> **supersedes** the dated `HANDOVER-*.md` files previously kept in
> `C:\Users\jaypa\LifeOS-plans\` (those are now stale; do not read them for
> current state — read this file instead).

# HANDOVER — LifeOS dual-critical-path build (2026-07-09, session 9 end)

You are taking over an autonomous, dual-lane (Claude + Codex) build program on **LifeOS**, a personal chief-of-staff app. Read this fully, then run a status sweep before acting.

---

## 0. Repo & orientation

- **Path:** `D:\OneDrive - Seneca\ContentFolder\AI\Codex\LifeOS` (GitHub `jpatel900/LifeOS`). Windows.
- **First actions:** `cd` in → `git checkout main && git pull --ff-only` → `gh pr list` → read memory `C:\Users\jaypa\.claude\projects\C--Users-jaypa\memory\lifeos-agent-pipeline.md` (the **2026-07-08/09 SESSION 9** block is authoritative; also read **SESSION 4 FINAL → STANDING LESSONS**) and `lifeos-dual-critical-path.md` (stable priority contract).
- **Branch discipline (binding):** create branches as a **standalone** command and verify `git branch --show-current` before every commit. A compound `test … && git checkout -b` SHORT-CIRCUITS on main and commits ON main.
- **Canonical surfaces:** Work map `C:\Users\jaypa\LifeOS-work-map.html` (keep current — owner is map-first; the status-log footer is now a collapsible `<details>` — edit inside `.log-body`). Priority contract `docs/implementation-planning/plan-dual-critical-path.md`. Plans/vision now live in `docs/implementation-planning/` and `docs/vision/` in this repo (see doc index below); SQL drift-fix scripts remain in `C:\Users\jaypa\LifeOS-plans\`.

## 1. Governing priority (owner, strict)

**★ Usability > ★ Enjoyability > everything else.** Usability = functionality + ease-of-use only up to where it doesn't balloon time/cost (don't gold-plate). Agent build-capacity serves usability's agent-buildable items first, then enjoyability. Parked work = one item per cycle (this cycle: distillation #289, **due Oct 1** — see §8), subordinate to both.

- **★ Usability** — all agent-items DONE. Now fully owner/usage-gated: **U1 ✓ (epic #251 closed), U2 ✓, U2b ✓, U4 ✓**. Remaining: **U3 populate real data → the live-in-it week** (the only place S9 data-dependent surfaces light up and the only honest enjoyment signal).
- **★ Enjoyability** — E1 (learning loop applies), E2 (stop re-nag), E3 (AI-prose rollup) all DONE. E3 provenance affordance shipped (#463). E4 (Telegram brief-push, Stage-3) is next but comes **after** the live-in-it week.

## 2. STATE RIGHT NOW (verified 2026-07-08/09)

- **main `cd40fca8`**, **0 open PRs**, **3 worktrees (NEVER prune the first two):** `main` (D:\), `owner-main` (`C:\Users\jaypa\LifeOS-main`), `agents/skills-sync` (`C:\Users\jaypa\.agents\.lifeos-skills-worktree`).
- **Migration Drift is RED** — prod is missing exactly ONE migration: `20260707120000` (duration_profiles, from E1 #458). Verified via the latest drift run on `cd40fca8` = failure. **Auto-apply (`migration-apply.yml`, #461) is MERGED but DORMANT: the `SUPABASE_PROD_MIGRATOR_URL` secret is NOT set.** Until set, `migration-apply.yml` SKIPS (`-z "$MIGRATOR_URL"` guard) — dispatching it does nothing. See §3.1. The owner was given the exact set-secret steps at session-9 end.
- **Prod is HEALTHY** — Provider Canary green (2026-07-08 15:38Z), no open incident issues. App is live and ready for U3.
- **Codex: no clean sandbox slice** (coherence guards + C-chain done; #448 owner-gated). Do NOT invent busywork.
- Milestones: constraint chain C1–C5; Stage-1 S0–S9 (epic #251 CLOSED); daily-driver floor G1–G4; coherence CO-0..7 (G-UX-2/3/4); INV-8 containment guarded; E1 foundation+apply, E2, E3 (+ provenance affordance) all merged; prod-migration auto-apply live.

## 3. IMMEDIATE NEXT ACTIONS (in order)

### 3.1 Clear the Migration Drift RED — the last usability blocker

Two paths (A preferred — makes ALL future migrations zero-touch):

- **Path A (owner sets the secret, you trigger+watch):** the OWNER sets GitHub Actions secret `SUPABASE_PROD_MIGRATOR_URL` = a **Session-pooler** DDL connection string (behind the Supabase green **Connect** button → **Session pooler**, NOT Transaction/Direct; port 5432; shape `postgresql://postgres.vpjmltajbaqxwunjjgtq:<PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres`; URL-encode symbols in the password). Distinct from the read-only `SUPABASE_PROD_DB_URL`. **THEN you run `gh workflow run migration-apply.yml -R jpatel900/LifeOS` and WATCH the FIRST run** (ledger-match caveat: the idempotency diff trusts prod's ledger version strings match repo filename prefixes; a past mismatched manual apply would red the first run — rolled back, fail-loud, not dangerous, diagnostic). Confirm it applies `20260707120000` and re-dispatches drift → GREEN.
- **Path B (owner pastes SQL now):** owner pastes `C:\Users\jaypa\LifeOS-plans\drift-fix-duration-profiles-2026-07-07.sql` in the Supabase SQL editor → re-run Migration Drift. Clears the RED immediately but doesn't enable auto-apply (still set the secret later).
- **You (agent) cannot set the secret** (masked, owner-only). At session start: check whether it's set (try dispatching Path A — if it SKIPS with the `::warning::…secret is not set`, it's still unset; if it applies, great). Help by confirming the connection-string shape and watching the run.

### 3.2 Support U3 → the live-in-it week (the real gate for everything)

This is THE next thing. On-ramp written: **`docs/implementation-planning/U3-live-in-it-onramp.md`** (ordered path: areas+accents → charter+operator profile [both feed the NS-INV-1 AI choke point immediately, highest payoff] → brain-dump capture → triage → plan → execute → close → repeat ~1wk; + what each step lights up; + clear-drift-first prereq). Data-entry surfaces verified: charters/operator-profile live in `Settings → Areas` (`AreaCharterPanel`/`OperatorProfilePanel`). **Most of U3 does NOT need the drift cleared** — only E1 duration-recalibration writes to duration_profiles, and that only after several execution sessions (load path is failure-isolated). So the owner can start immediately; setting the secret first is cleanest.

- **How to help:** pair with the owner as they populate (sanity-check charters, walk steps 1–2), and — critically — **watch for data-entry surfaces misbehaving on real data**. That's the first FRESH agent-buildable work: real-use bugs the live-in-it week surfaces. This is where agent work re-opens.

### 3.3 Keep Codex busy — only if a clean slice exists

Agent-buildable work is genuinely THIN (usability owner-gated; E1–E3 done; E4 post-live-in-it-week; no clean Codex slice). The pattern that works for Codex: guard tests, pure-logic utilities, additive migrations with verbatim SQL. Do NOT force hot-file/AI/judgment work onto Codex. If nothing clean is ready, **say so — don't invent busywork** (the owner may push "continue work"; the honest answer when the well is dry is to support U3 prep, not manufacture PRs).

## 4. OWNER QUEUE (manual — cannot be agent-done)

1. **Clear drift** (§3.1) — set `SUPABASE_PROD_MIGRATOR_URL` (then agent triggers+watches Migration Apply) OR paste `drift-fix-duration-profiles-2026-07-07.sql`.
2. **U3 — populate real life-context** → the live-in-it week (§3.2, on-ramp doc).
3. **Close CO-6 #398** (merged in #405).
4. _(Housekeeping)_ delete the lingering merged `guard/server-timestamp-coverage` remote branch (created by a mid-session push race; harmless).

## 5. Session 9 deliverables (ALL MERGED)

- **#462** — Codex #338 recovered INLINE (kick stranded ~20h): new `serverTimestampCoverage.test.ts` guard (every created_at table needs a BEFORE INSERT server-timestamp trigger; 17 covered, 3 exempt, negative control + exact-set drift alarm) + KNOWN_ISSUES row 14 resolved. Closed #338.
- **#463** — E3 "AI-polished" provenance affordance on the weekly rollup (badge + Keep-original/Use-AI toggle). **Advisor caught a real honesty bug mid-build (fixed):** the `enhanced` flag was derived from `requestRollupProse`, which never throws → would have badged deterministic fallback text as "AI-polished" on any model outage. Fixed by threading the server's honest `source` ("ai" vs "deterministic"). Dormant until real rollup data.
- **#464** — TriageSheet test-flake fix: root-caused as a sessionStorage state-leak between tests; made every test hermetic (describe-level beforeEach/afterEach clear).
- **#465** — ALTER-guard follow-up (owner-chosen): the #338 guard now also catches a created_at added via `ALTER TABLE`. No false positives (drift alarm still resolves to 17).
- **Also:** wrote the U3 on-ramp; converted the work-map footer to a collapsible `<details>`; map + memory kept current.
- **Owner this session:** merged all 4 PRs; (from session 8/prior) closed epic #251, applied the U2 migration batch.

## 6. Binding working method + KEY LESSONS

- **★ SELF-APPROVAL CLASSIFIER BLOCKS CLAUDE MERGING ITS OWN PRs.** A Claude-authored PR (even green, even standalone `gh pr merge`) is refused → **owner-merge**. **Codex-authored PRs merge fine.** Lane economics: kick sandbox-appropriate work to Codex so _it_ can be merged; do hot-file/AI/judgment inline and expect the owner to merge.
- **Gate:** scope-check (grep forbidden paths) + `gh pr checks <n> --watch --required` + `gh pr merge <n> --squash --delete-branch` **standalone** (never compound, never `--admin`). Supabase-CLI download rate-limit flakes the Migrations+RLS lane ~21–28s → `gh run rerun <id> --failed`.
- **New user-owned table** = correct clock trigger + owner RLS + composite `(id,user_id)` FKs + `USER_DATA_EXPORT_TABLES` in the SAME PR (INV-2). **Migrations+RLS CI lane is the real gate** (mock vitest + Codex sandbox are schema-blind). Additive-only (NS-INV-2). Codex schema PRs ALWAYS need the maintainer to diff data-layer writes vs the migration.
- **Layer-per-commit; verify per layer; read the actual `Tests N passed | 0 failed` line.** Fast checks: `pnpm --filter @lifeos/web test`, `type-check`, `lint`; schemas `pnpm --filter @lifeos/schemas test` (57|0). `scripts/agent/*.test.mjs` use node:test (run directly, NOT vitest CI). NOTE: passing a filter to `pnpm ... test -- <name>` runs the WHOLE suite; use `cd apps/web && npx vitest run <path>` to isolate.
- **Use the advisor** before substantive work and before declaring done — this session it caught the E3 provenance-honesty bug (a flag derived from a never-throws fallback lies on the fallback path — **test a status flag's DERIVATION, not just its rendering**) and prescribed the exact fix. Prior sessions it caught 2 more real bugs.
- **T2 = owner-merge** (`.github/workflows/**`, prod RBAC). Author, get green, leave the merge to the owner.
- Keep the **work map + memory current at every task completion** (owner is map-first).

## 7. Gotchas / lessons (bind these)

- **Prod-migration auto-apply is LIVE but DORMANT** (`migration-apply.yml`, #461) until `SUPABASE_PROD_MIGRATOR_URL` is set. A migration that can't run in a transaction (`create index concurrently`) fails the job → apply that one manually. First-run ledger-match caveat (§3.1). Manual `pnpm drift:assemble` runbook remains the fallback.
- **A PR you're extending can be owner-merged mid-session.** #462 merged while I built its ALTER follow-up on the same branch → the post-merge branch-delete + my push recreated a junk remote branch on stale main. Recovery: fresh branch off a freshly-fetched origin/main + `git cherry-pick` the commit (clean — squash preserves file content). Branch follow-ups off fresh main, don't stack on a soon-to-merge branch.
- **Remote-branch deletion is classifier-blocked** for the agent (destructive) — leave it to the owner.
- **Known flake (now FIXED):** `TriageSheet.test.tsx` — was a sessionStorage leak, fixed in #464. The OTHER one, `triage.test.tsx` "renders split drafts", is a timeout under parallel load — already mitigated by #390's 10s windows + that file's beforeEach clear.
- **E3 honesty spine** (`rollupProseService.ts` + `rollupProseClient.ts`): item-set-preservation + counts-fixed live in BOTH server and client. The provenance flag (`enhanced`) is derived from the server's `source: "ai"` — do NOT re-derive it from a fallback-y source. If you touch rollup prose, don't weaken this.
- **STOP-and-surface (ADR 0004):** when two features/artifacts/invariants contradict, or a change relaxes a load-bearing invariant, surface it, don't silently resolve.
- **Subagent `isolation:"worktree"` LEAKS on this OneDrive path** — files land in the SHARED checkout, branch stays EMPTY. Salvage: TaskStop → `git checkout -b` carries them.

## 8. Backlog / parked (not now)

INV-8 delimiter hardening #448 (owner-gated, byte-identical NS-INV-1 contract, before Stage 3) · INV-9 per-surface context budgets (needs a budget-declaration design pass) · Stage 2 planning #292 (unblocked by #251 closure, but **premature before the live-in-it week** — the owner is averse to overplanning-before-living; real usage should shape it) · distillation #289 (parked-rotation pick, but **due 2026-10-01**; failure docs are already lean at ~138 lines — no compression pressure now; don't run it early) · #268 autonomy-graduation-gate checklist (strategy/design) · #269 janitor report (maintainer-machine task failure + deliberate env-gated test skips — mostly false-positives) · E3 monthly rollup (only weekly is enhanced end-to-end; `composeMonthlyRollupDraft` exists but no monthly surface) · E4 outbound Telegram brief-push (Stage-3, after the live-in-it week).

---

**If you do only one thing first:** check whether the owner set `SUPABASE_PROD_MIGRATOR_URL` — if so, dispatch `migration-apply.yml` and WATCH the first run to clear the drift RED; if not, remind them (steps in §3.1). Then the whole program hinges on the owner doing **U3 (populate real data) → the live-in-it week** — support that (on-ramp in `docs/implementation-planning/U3-live-in-it-onramp.md`), watch for real-use data-entry bugs (the first fresh agent-buildable work), and keep the map + memory current. Agent build work is thin until U3; don't invent busywork.
