> **This is the single, authoritative, rolling cold-start handover for LifeOS.**
> It is **overwritten** at the end of every session — git history preserves
> every prior version, so there is no need to keep dated copies. This file
> **supersedes** the dated `HANDOVER-*.md` files previously kept in
> `C:\Users\jaypa\LifeOS-plans\` (archived; do not read them for current
> state — read this file instead).

# HANDOVER — LifeOS dual-critical-path build (2026-07-09, session 10 end)

You are taking over an autonomous, dual-lane (Claude + Codex) build program on **LifeOS**, a personal chief-of-staff app. Read this fully, then run a status sweep before acting.

---

## 0. Repo & orientation

- **Path:** `D:\OneDrive - Seneca\ContentFolder\AI\Codex\LifeOS` (GitHub `jpatel900/LifeOS`). Windows.
- **First actions:** `cd` in → `git checkout main && git pull --ff-only` → `gh pr list` → run `node scripts/agent/status.mjs` → read memory `C:\Users\jaypa\.claude\projects\C--Users-jaypa\memory\lifeos-agent-pipeline.md` (distilled: mechanics + standing lessons) and `lifeos-dual-critical-path.md` (stable priority contract).
- **Default work source:** `status.mjs`'s **Agent pickup queue** section (checkbox items tagged `AGENT-TODO:` per AGENTS.md rule 15) is pre-classified as agent-doable. When no higher-priority directive from this handover applies, work that queue next — do not re-triage those items or second-guess the marker. OWNER-GATE items are never agent-actionable.
- **Branch discipline (binding):** create branches as a **standalone** command and verify `git branch --show-current` before every commit. A compound `test … && git checkout -b` SHORT-CIRCUITS on main and commits ON main. Before branching off `origin/main`, verify the local ref is actually fresh: compare `git rev-parse origin/main` against `gh api repos/jpatel900/LifeOS/branches/main --jq .commit.sha` — a silently-stale ref on this OneDrive checkout once produced a branch off a pre-consolidation base. Check whether another agent owns the main checkout before using it; work in a worktree if in doubt.
- **Canonical surfaces:** the work map is **GENERATED** — `node scripts/agent/status.mjs --html --out "C:\Users\jaypa\LifeOS-work-map-generated.html"` (two views: "Now" + filterable "Full map" incl. closed issues and the Plans & ideas shelf; regenerate rather than hand-edit — the old hand-maintained map is archived). Priority contract `docs/implementation-planning/plan-dual-critical-path.md`. Plans/vision live in `docs/implementation-planning/` and `docs/vision/` in this repo.

## 1. Governing priority (owner, strict)

**★ Usability > ★ Enjoyability > everything else.** Usability = functionality + ease-of-use only up to where it doesn't balloon time/cost (don't gold-plate). Lane labels `usability` / `enjoyability` exist on GitHub and drive the map's two-lane view — label new issues at creation.

- **★ Usability** — all agent-items DONE; drift CLEARED; auto-apply LIVE. Remaining: **the owner runs the scripted test plan** (replaces the open-ended live-in-it week — see §3.1).
- **★ Enjoyability** — E1/E2/E3 (+ provenance affordance) DONE. E4 (Telegram brief-push, Stage-3) comes **after** the test plan produces its findings.

## 2. STATE RIGHT NOW (verified 2026-07-09 late)

- **1 open PR: #480** (capture-pill overlap fix, closes #477; Claude-authored → owner-merge; all evidence in the PR body).
- **Migration Drift GREEN. Prod-migration auto-apply is LIVE and PROVEN** — the owner set `SUPABASE_PROD_MIGRATOR_URL` (Session-pooler DDL string) and `migration-apply.yml` applied `20260707120000` end-to-end. Prod migrations are no longer manual toil.
- **Prod HEALTHY and the moments home layout is FIXED live** (#470: the page shell wraps TodayMoments; horizontal-overflow guard in `moments-home-parity.spec.ts`; verified in production by screenshot).
- **Smoke posture:** dedicated smoke account created and swapped into `SMOKE_EMAIL`/`SMOKE_PASSWORD`; `playwright.smoke.config.ts` artifacts default OFF, `weekly-prod-smoke.yml` opts in via `SMOKE_CAPTURE_ARTIFACTS=1`; `--trace off` CLI override is KEPT (a trace records the plaintext password — never remove it).
- **CI hardening live:** `pnpm format:check` is BLOCKING in ci.yml AND the codex lane (baseline cleaned in #472); Supabase CLI pinned 2.109.1; Migration Drift FAILS loudly if its secret goes missing (skip = manual dispatch `allow_skip=true` only); **Vercel skips builds on docs/.github/.agents-only pushes** — proven live (skipped pushes show as CANCELED deployments, code pushes build; `vercel.json` lives in `apps/web/` because the Vercel Root Directory is `apps/web`).
- **Self-healing:** `format-selfheal.yml` auto-PRs the prettier fix when main reds on formatting (docs-only heals ride safe-automerge). Main Red Guard's silent push-403 is REPAIRED (checkout/push on `github.token`; PR creation on the kick PAT so checks trigger). Both landed in #479.
- **Governance:** AGENTS.md rule 15 (verified claims + SELF-AUDIT + `OWNER-GATE:`/`AGENT-TODO:` markers) and rule 16 (improvement-loop dampener, one-in-one-out, process-weight review) are live and already in use.

## 3. IMMEDIATE NEXT ACTIONS (in order)

### 3.1 The scripted test plan — THE gate for everything downstream

The open-ended "live-in-it week" was replaced (owner time constraint) by **7 scripted sessions, ~90 min total over ~a week**: `C:\Users\jaypa\LifeOS-plans\U3-scripted-test-plan.md` (the only live file left in that folder). Owner marks each step ✅/⚠️/❌ and hands the file back. Session 3 (real Google Calendar, incl. the never-tested all-day-conflict case) is the highest-value 15 minutes. Sessions must span calendar days (re-entry ritual, weekly rollup, and the learning loop need day gaps and ≥3 execution sessions).

- **When the marked-up file comes back:** farm every ⚠️/❌ into properly-labeled GitHub issues (lane label + `AGENT-TODO:`/`OWNER-GATE:` follow-ups), severity-ranked, routed per lane economics (§6). That refills the pickup queue with evidence-driven work.

### 3.2 Work the Agent pickup queue

Current queue: **#478** (moments empty-state dead space — EXPLICITLY WAITS for real U3 data; do not start early) and **#477** (drops out when the owner merges #480). If the queue is empty and no test-plan findings exist, **say so — don't invent busywork** (rule 16).

### 3.3 Codex lane

No clean sandbox slice until test-plan findings arrive. The pattern that works: guard tests, pure-logic utilities, additive migrations with verbatim SQL. Delivery protocol v2 (patch embedded in the final summary) — extraction recipe in memory.

## 4. OWNER QUEUE (true OWNER-GATEs only)

1. **Merge #480** (pill fix — Claude-authored, self-approval classifier).
2. **Run test-plan Session 0 + 1** (~25 min; starts the data clock for sessions 5–7).
3. Close CO-6 #398 (merged in #405, still open).
4. _(Housekeeping)_ delete merged remote branches `guard/server-timestamp-coverage` and `docs/handover-session10` (PR #481 — cut from a stale local origin/main ref but auto-merged cleanly; #482 layered the corrections on top).

## 5. Session 10 deliverables (2026-07-09, all merged unless noted)

- **#467** consolidation: plans/vision docs into the repo + this rolling handover created. **#468** AGENTS.md rules 15+16. **#469/#473** generated work map (two views, filters, plans shelf). **#470** moments home page-shell fix (+ overflow guard) — verified live. **#471** privacy batch: public-evidence hygiene guard test, project-ref scrub, SECURITY.md, smoke artifacts opt-in. **#472** CI/cost batch: blocking format check, drift-guard fence, pinned CLI, Vercel docs-only skip (+ one-time 92-file format-baseline cleanup). **#474** smoke artifacts on (owner-ratified) + codex-lane blocking format. **#475** OWNER-GATE/AGENT-TODO markers + mechanical triage collector (Agent pickup queue). **#476** (auto-merged) the KNOWN_ISSUES format fix that healed a red main. **#479** format self-heal workflow + Main Red Guard token repair. **#480** (OPEN) capture-pill overlap fix, salvaged from a stopped agent and verified end-to-end (A/B-proven guard).
- **Also:** drift cleared via first live auto-apply run; dedicated smoke account swapped in (owner); lane labels created and applied; issues #477/#478 filed with markers; pipeline driver SKILL retargeted (weekly: status sweep → merge pass → ONE pickup item → Stage-2 cutover watch → health glance); C:\ drive archived to just the test plan + `_archive/`; memory distilled (31k→11k tokens, history archived).

## 6. Binding working method + KEY LESSONS

- **★ SELF-APPROVAL CLASSIFIER BLOCKS CLAUDE MERGING ITS OWN PRs** → owner-merge. Codex-authored PRs merge fine. T2 (`.github/workflows/**`, prod RBAC) always owner-merge.
- **Rule 15 report contract:** verified claims with command+output only; "should work" is banned; UNVERIFIED list; SELF-AUDIT ≤10 lines; leftover items tagged `OWNER-GATE:`/`AGENT-TODO:`. Treat an evidence-free report as NOT DONE.
- **Visual gate:** no UI-touching PR merges on behavior-green alone — screenshot the rendered page and have eyes (vision-capable review) on it. Behavior tests, token guards, and E2E are all blind to composition; that blindness shipped a structurally-broken home page once.
- **Two green PRs can combine into a red main** (the #471×#472 49-second merge race) — format-selfheal now auto-repairs the formatting case; expect the class, not just the instance.
- **Token semantics for workflow automation:** `github.token` for git pushes (has contents:write); a real-user PAT for `gh pr create` (PRs opened by `github.token` never trigger CI — checks sit pending and automerge can never land).
- **Gate cheaply:** scope-check + required lanes green + flake-rerun (`gh run rerun <id> --failed` for the ~21-28s Supabase-CLI download flake). Known e2e flake: the `/moments-preview` capture round-trip times out under full-file load; passes isolated.
- **Migrations+RLS CI lane is the real schema gate** (mock vitest + Codex sandbox are schema-blind). New user-owned table = clock trigger + RLS + composite FKs + export coverage in ONE PR (INV-2). Additive-only.
- **Use the advisor** before substantive work and before declaring done — it has caught real bugs in 3 consecutive sessions (latest: the provenance flag derived from a never-throws fallback).
- **Salvage protocol works:** a stopped/stalled agent's branch + uncommitted diff is recoverable — inspect, verify yourself (including the guard-discriminates A/B), finish, credit provenance in the PR.

## 7. Gotchas (bind these)

- **Worktrees:** NEVER prune `main` (D:\), `owner-main` (`C:\Users\jaypa\LifeOS-main`), `agents/skills-sync`. Subagent `isolation:"worktree"` LEAKS on the OneDrive path — agents create their own worktrees under scratchpad with absolute paths, or use the main checkout only when no other agent owns it.
- **Remote-branch deletion is classifier-blocked** for agents — owner housekeeping.
- **`pnpm status` arg passthrough:** `node scripts/agent/status.mjs` directly is the reliable invocation; `--out <path>` for the HTML target.
- **E3 honesty spine** (`rollupProseService.ts`/`rollupProseClient.ts`): item-set-preservation + counts-fixed live in BOTH server and client; `enhanced` derives from the server's `source:"ai"` — never re-derive from a fallback-y source.
- **STOP-and-surface (ADR 0004):** contradictions and invariant-relaxing changes get surfaced, not silently resolved.
- **The pickup-queue collector scans the last 20 MERGED PRs too** — tick `[x]` on completed AGENT-TODO/OWNER-GATE checkboxes in merged-PR bodies or they nag forever.

## 8. Backlog / parked (not now)

Test-plan findings (the next real work source) · **Task-map v1/v2 (FR-031 reserved; owner extended the design 2026-07-09: true DAG with branching/merging, critical-path highlight, optional nodes feeding DoD, red do-not/only-if nodes — see `docs/implementation-planning/plan-task-map-contract.md` + memory `lifeos-task-map-progression-idea`; post-test-plan)** · INV-8 delimiter hardening #448 (owner-gated, before Stage 3) · Stage 2 planning #292 (premature before real-usage signal) · distillation #289 (due 2026-10-01) · #268 autonomy-gate checklist · #269 janitor report · E3 monthly rollup surface · E4 Telegram push (Stage-3, post-test-plan) · #478 empty-state composition (waits on U3 data).

---

**If you do only one thing first:** run `node scripts/agent/status.mjs` and check whether the owner has returned the marked-up test plan (`C:\Users\jaypa\LifeOS-plans\U3-scripted-test-plan.md`). If yes — farming those findings into labeled, marker-tagged issues is the top priority. If no — work the pickup queue if non-empty, else support the owner starting Session 0 and don't invent busywork.
