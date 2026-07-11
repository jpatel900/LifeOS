> **This is the single, authoritative, rolling cold-start handover for LifeOS.**
> It is **overwritten** at the end of every session — git history preserves
> every prior version, so there is no need to keep dated copies. This file
> **supersedes** the dated `HANDOVER-*.md` files previously kept in
> `C:\Users\jaypa\LifeOS-plans\` (archived; do not read them for current
> state — read this file instead).

# HANDOVER — LifeOS acceleration sprint (2026-07-11, session 11 end)

You are taking over an autonomous, multi-lane (Claude supervisory + Sonnet implementation + Codex) build program on **LifeOS**, a personal chief-of-staff app. Read this fully, then run a status sweep before acting.

---

## 0. Repo & orientation

- **Path:** `D:\OneDrive - Seneca\ContentFolder\AI\Codex\LifeOS` (GitHub `jpatel900/LifeOS`). Windows. Treat the checkout as READ-ONLY; do all git work in worktrees under `C:\Users\jaypa\lifeos-worktrees\`.
- **First actions:** `git fetch origin main` → verify `git rev-parse origin/main` against `gh api repos/jpatel900/LifeOS/branches/main --jq .commit.sha` → `gh pr list` → `node scripts/agent/status.mjs` → read memory `lifeos-agent-pipeline.md` (mechanics + standing lessons) and the local volatile handover `C:\Users\jaypa\LifeOS-plans\handover-2026-07-10-fable-session.md`.
- **Branch discipline (binding):** branches as standalone commands; verify `git branch --show-current` before commits; verify origin/main freshness before branching (stale-ref incident #481).
- **Work source:** `status.mjs` Agent pickup queue (`AGENT-TODO:` markers). OWNER-GATE items are never agent-actionable. If the queue is empty and no test-plan findings exist, say so — don't invent busywork (rule 16).
- **Environment gotchas (new this session):** export `CI=true` for all pnpm commands in fresh worktrees (a pnpm version mismatch otherwise triggers an unanswerable interactive purge prompt). Prefer `git -C <path>` / `pnpm --dir <path>` over `cd` compounds (permission allowlist matches those forms). **Port 3000 is the owner's Hermes WhatsApp bridge — NEVER kill it**; preview servers use autoPort.

## 1. Governing priority (owner, strict)

**★ Usability > ★ Enjoyability > everything else.** The owner's scripted test plan (`C:\Users\jaypa\LifeOS-plans\U3-scripted-test-plan.md`, Sessions 0+1 first, Session 3 highest-value) remains THE top gate — most remaining decisions want its real-data findings. When the marked-up file comes back: farm every ⚠️/❌ via `node scripts/agent/farm-test-plan.mjs` into labeled, marker-tagged issues.

**Owner standing order (2026-07-10, ACTIVE while the current Fable usage pool lasts):** green checks ⇒ merge and continue without waiting; failures ⇒ diagnose, fix, keep running. Exceptions that stay owner-merge: FR-ratification docs PRs, service-role/security surfaces, T2 files (`.github/workflows/**`, prod RBAC). When the pool runs out, revert to owner-gated merges. Also owner prefs (memory): simple language, short chat updates, detail in PRs.

## 2. STATE RIGHT NOW (verified 2026-07-11)

- **Design epic #483: D-1..D-7 ALL MERGED** (#489 #497 #500 #502 #503 #504 #507 + light-theme fix #505). The app runs prototype-2's palette, system fonts, start hero, stage rail, right rail, timeline states, keyboard legend, and capture-pill copy. OWNER-GATE open: final side-by-side ratification (owner verdict so far: prototype still best-looking but "too many things going" — expect trim packets, not more porting). Deltas/progress-bars/avatars deliberately NOT ported (no truthful data source — documented per-PR).
- **FR-031 task map: slices 1+2 on main** — pure graph engine (`apps/web/src/lib/taskmap/graph.ts`, #494) + strict zod draft schema (`packages/schemas/src/task-map.ts`, #498). Next slices (additive `progression_map` persistence on tasks, drafting integration via the parse choke point, approve/collapse UI) are the biggest ratified unbuilt work — contract per FR-031 + `docs/implementation-planning/plan-task-map-contract.md`.
- **E4 / FR-046 Telegram daily brief: LIVE IN PRODUCTION (2026-07-11).** #506 (FR docs, owner-ratified) → #511 (pure composer/sender, Codex) → #516 (env-gated GET route + service-role owner loader, owner-reviewed). Owner set all four secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `OWNER_USER_ID`) and verified a real send to his Telegram. **#517 (open at handover) moves the cron into `apps/web/vercel.json`** — #516's root-level vercel.json was dead (Vercel Root Directory = `apps/web`), so the DAILY send was never registered even though manual triggers work. After #517 deploys, verify Vercel → Settings → Cron Jobs lists `/api/brief/telegram` (daily 11:00 UTC). Production domain: `life-os-web-azure.vercel.app`.
- **Monthly rollup surface shipped** (#486 → #512): Close-moment card mirroring weekly end-to-end, composed from approved weekly rollups, MoM readback, same AI-prose choke point + provenance badge.
- **Repo hygiene:** `.agents/skills/**` prettierignored (#508/#509) — the daily skill-hub sync can no longer red main (2026-07-10 red root cause: sync content is prettier-non-idempotent; auto-revert #499 healed it; the reverted sync re-lands on its next run). DATA_MODEL rollup staleness fixed (#513/#514). #484 closed (work shipped). Janitor + pipeline driver verified healthy 2026-07-11 (driver = app-scheduler task `lifeos-pipeline-driver`, daily 09:43 local; it merges green Codex-lane PRs — post CLAIM comments on issues before picking anything up).
- **Vercel platform outage 2026-07-10 evening** (`sts_credentials_fetch_failed`, their side) — recovered. Vercel is NOT a merge-required check.

## 3. IMMEDIATE NEXT ACTIONS (in order)

1. **Confirm #517 merged + the cron actually registered** (§2). If the owner reports no morning brief, this is the first suspect; second suspect is the four env values.
2. **Check whether the owner returned the marked-up test plan** — if yes, farming findings is the top priority.
3. **FR-031 next slices** if the owner asks for throughput. Do NOT start #478 (needs real U3 data) or new design packets (need the owner's #483 verdict).
4. **#448 (INV-8 prompt-hardening) before ANY inbound channel rung** — recorded on #448: outbound-only E4 does not open the vector, but nothing inbound (Telegram replies, share targets, email ingestion) may ship before #448 lands. Owner-gated (prompt-architecture + golden-eval re-baseline decision).

## 4. Standing lessons added this session (beyond lifeos-agent-pipeline.md)

- **Vercel facts:** Root Directory is `apps/web` → only `apps/web/vercel.json` is read (a root vercel.json is silently dead). Vercel crons are GET-only and auto-send `Authorization: Bearer ${CRON_SECRET}`. Vercel checks are not merge-required.
- **Codex lane:** delivery may be a raw diff (git apply, then commit with Codex author attribution via `-c user.name=Codex -c user.email=<codex-email>` — copy the exact email from any prior Codex-authored commit in git log) OR a git-am patch — check for a `From `/`commit ` header. Kick comments posted via local `gh` are owner-authored (local gh auth = jpatel900), so kicks work without the PAT. Codex's self-reported "all green" can be true while YOUR validation env is broken (CI=true lesson) — distinguish patch defects from env defects before re-kicking.
- **Subagent lane:** two stall classes seen (delegate-and-quit near the end; mid-run stream stall). Salvage = inspect worktree, validate everything yourself, commit with a provenance note. Never SendMessage-resume. A fresh continuation agent on the same worktree works well after a blocker resolves (see #515's two-agent history; its stop-and-report on the owner-resolution blocker was correct behavior — reward it in contracts).
- **Auto-mode classifier:** brief repeated outages ("claude-opus-4-8[1m] temporarily unavailable") — retry after ~1 min; stage PR bodies/files to scratchpad via Write meanwhile. Compound Bash commands are evaluated whole: one non-allowlisted token (`rm`, `cd`) routes the entire command to the classifier.
- **Visual gate practice:** Playwright headless via `@playwright/test` chromium run from the worktree (`npx playwright install chromium-headless-shell` if missing); demo mode renders the empty state — seed captures via the `c` keyboard flow for live counts, and press `1` after seeding (capture flow can leave you on the Close tab). Theme stores are still split: next-themes (`html.light`, `theme` key) vs cockpit (`data-theme`, `lifeos.cockpit.preferences`) — unification open on #501's notes.

## 5. Retained binding lessons (from session 10 — still true)

- **Rule 15 report contract:** verified claims with command+output only; "should work" banned; UNVERIFIED list; SELF-AUDIT. Evidence-free report = NOT DONE.
- **Visual gate:** no UI-touching PR merges on behavior-green alone — render, screenshot, eyes on.
- **Merge-race class:** two green PRs can combine into a red main — expect the class.
- **Migrations+RLS CI lane is the real schema gate**; new user-owned table = trigger + RLS + FKs + export coverage in ONE PR, additive-only.
- **Worktrees:** NEVER prune `main` (D:\), `owner-main` (`C:\Users\jaypa\LifeOS-main`), `agents/skills-sync`. Remote-branch deletion is owner housekeeping.
- **E3 honesty spine** (`rollupProseService/Client`): item-set preservation + counts-fixed live on BOTH sides; `enhanced` derives from the server's `source:"ai"` only.
- **STOP-and-surface (ADR 0004):** contradictions and invariant-relaxing changes get surfaced, not silently resolved.
- **Pickup-queue collector scans merged-PR bodies** — tick completed `[x]` checkboxes or they nag forever.

## 6. Owner gates open at handover

1. Test plan Sessions 0+1 (top gate; ~25 min).
2. #483 final look ratification (best after test-plan week; his "too much going on" trim feedback is recorded on the issue).
3. FR-031 next-slice go-ahead (optional — fully ratified, agents can proceed on request).
4. #448 prompt-architecture decision (before any inbound rung).
5. Optional lanes: GPT-5.6 Sol/Terra/Luna credits exist (memory `gpt56-lane-available.md` — never trust self-reported results; supervisor re-validates everything).

---

**If you do only one thing first:** check #517's state, then `node scripts/agent/status.mjs` and whether the marked-up test plan is back. Findings-farming beats everything else; otherwise work the queue; otherwise don't invent busywork.
