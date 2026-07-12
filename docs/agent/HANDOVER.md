> **This is the single, authoritative, rolling cold-start handover for LifeOS.**
> It is **overwritten** at the end of every session — git history preserves
> every prior version, so there is no need to keep dated copies. This file
> **supersedes** the dated `HANDOVER-*.md` files previously kept in
> `C:\Users\jaypa\LifeOS-plans\` (archived; do not read them for current
> state — read this file instead).

# HANDOVER — LifeOS continuous-loop build (2026-07-12, session 12)

You are taking over an autonomous, multi-lane (Fable supervisory + Sonnet implementation + Codex) build program on **LifeOS**, a personal chief-of-staff app. Read this fully, then run a status sweep before acting.

---

## 0. Repo & orientation

- **Path:** `D:\OneDrive - Seneca\ContentFolder\AI\Codex\LifeOS` (GitHub `jpatel900/LifeOS`). Windows. Treat the checkout as READ-ONLY; do all git work in worktrees under `C:\Users\jaypa\lifeos-worktrees\`.
- **First actions:** `git fetch origin main` → verify against `gh api repos/jpatel900/LifeOS/branches/main --jq .commit.sha` → `gh pr list` → `node scripts/agent/status.mjs` → read memory `lifeos-agent-pipeline.md` and the local volatile handover `C:\Users\jaypa\LifeOS-plans\handover-2026-07-10-fable-session.md`.
- **Branch discipline (binding):** branches as standalone commands; verify `git branch --show-current` before commits; verify origin/main freshness before branching (a just-merged PR means your local origin/main ref is stale — fetch in the worktree and `merge --ff-only`, since `git reset --hard` is deny-listed).
- **Environment gotchas:** `CI=true` on all pnpm commands in fresh worktrees; `git -C`/`pnpm --dir` forms (never `cd` compounds); **port 3000 is the owner's Hermes WhatsApp bridge — NEVER kill it** (visual-gate dev servers: 3100+). `pnpm run dev -- -p N` literalizes the `--`; use `pnpm --dir <app> exec next dev -p N`.

## 1. Governing priority + standing orders

**★ Usability > ★ Enjoyability > everything else.** The owner's scripted test plan (`C:\Users\jaypa\LifeOS-plans\U3-scripted-test-plan.md`) remains THE top gate for evidence-driven work — not returned as of 2026-07-12.

**Owner standing order (2026-07-12, ACTIVE until the Fable usage pool is exhausted):** continuous loop, NO stopping to ask; green checks ⇒ merge (including UI PRs — the owner explicitly named merging without review); pick next work; implement via subagents (Sonnet lane) and Codex credits (kick lane); repeat. Owner-gated items may pile up. Stage gates and ADR invariants still bind (do not jump Stage-2 usage gates; security/RLS/service-role/T2 surfaces keep human review — the auto-mode classifier enforces some of this regardless: it blocked issue-body edits and one UI merge before the explicit order, and blocks `git reset --hard` always).
Owner comms: `hermes send -t telegram -s "subject" "body"` reaches the owner's Telegram directly (one-way; he answers in the Claude session).

## 2. STATE (verified 2026-07-12)

- **FR-031 task-map v1 is COMPLETE, all merged 2026-07-11→12:** #519 persistence columns + validation gate → #520 AI draft endpoint + one-pass approve (`task_map.v1` instrumented) → #521 Flow-moment UI (draft review / collapse-to-critical-path / expand) → #522 node completion (per-node `completed_at`, reversible, next-node advance) → #523 DoD-cap CUT SCOPE surfaces uncompleted optional nodes → #524 user-requested regen (draft-until-approved, completion carry-forward) → #525 validator fix legalizing branch+merge diamonds (one-branch-shape rule; sequential sibling shapes still rejected — loosening is an owner call).
  - v1 scope decisions recorded in PR bodies: `map_status` `'draft'`/`'superseded'` reserved (no history table in v1); evidence-triggered revision proposals are v2 (`plan-task-map-contract.md` §4.3); DATA_MODEL 4.16 rewritten to the shipped jsonb-document shape (task_edges stays v2).
- **E4 Telegram daily brief:** live; cron registered via `apps/web/vercel.json` (#517), first scheduled send expected 11:00 UTC 2026-07-12 — confirm with the owner.
- **In flight at handover:** #526 (Codex kicked: pure overplanning-dwell + map-progress helpers — FR-031 §6 instrumentation); a KNOWN_ISSUES verification-pass docs PR (Sonnet agent; row 13 /health-truthfulness is stale — actually shipped 2026-07-04 via #333; other rows may be stale too).
- **Design epic #483:** D-1..D-7 shipped; OWNER-GATE: final ratification + tick the six D-checkboxes (agent classifier-blocked from editing the issue body — the pickup queue nags until ticked).
- **Visual gate practice (Browser pane screenshots broken in this env):** background `next dev` on 3100+ → Playwright headless script → save PNGs to scratchpad → READ the PNGs. Demo mode persists in sessionStorage across `page.goto`. Cockpit drive: /capture → Save thought → Do today → Plan → drop 8a → Start focusing. Stub `page.route("**/api/task-map", ...)` for AI-dependent states. The DoD-cap moment is NOT quickly reachable in demo (60-min focus timer) — component tests are the accepted evidence there.

## 3. NEXT ACTIONS (loop order)

1. Harvest #526 (Codex PR: verify yourself — patch may arrive as diff-in-summary; never trust self-reports) and the KNOWN_ISSUES verification PR; merge on green.
2. Check whether the owner returned the test plan → if yes, `node scripts/agent/farm-test-plan.mjs` and farming beats everything.
3. Keep the loop: next agent-buildable, stage-legal work toward the vision. Verified-open veins: #269 janitor report (standing, propose-only); #268 autonomy-gate checklist (docs); workflow.ts split paydown (KNOWN_ISSUES row 8, "when next touched"); v0 rail "+N steps" label overlap at 1280px (pre-existing nit, candidate for a #483 trim packet). Do NOT start: #478 (needs U3 data), Stage-2 items (#292 gate), #448 (owner-gated prompt architecture), calendar-write expansion (KNOWN_ISSUES rows 1-2, needs dedicated reviewed spec).
4. Rotate the volatile handover + memory at checkpoints; regenerate the work map (`node scripts/agent/status.mjs --html --out "C:\Users\jaypa\LifeOS-work-map-generated.html"`).

## 4. Binding lessons (rolling, distilled)

- **Rule 15 report contract** (verified claims with command+output; UNVERIFIED list; SELF-AUDIT). Evidence-free report = NOT DONE.
- **Visual gate:** no UI PR ships on behavior-green alone — render, screenshot, eyes on (see §2 recipe). It caught 2 real composition defects in slice 5 that 19 component tests missed.
- **Subagent lane:** Sonnet implements to a tight contract; Fable verifies everything (diff read + CI + visual). Stall classes: delegate-and-quit while a background test runs (tell them not to end with only a background task pending — still happens), mid-stream stall near the end (SendMessage-resume works fine for finishing mechanical steps).
- **Codex lane:** kick via owner-authored `gh issue comment "@codex ..."`; sandbox cannot push reliably — patch may arrive embedded in the summary (extract per memory recipe); validate in YOUR env with CI=true before judging the patch.
- **Merge-race class:** two green PRs same-file can red main; sequence merges or keep slices file-disjoint.
- **Migrations+RLS CI lane is the real schema gate**; additive-only; new user-owned table = trigger+RLS+FKs+export in ONE PR.
- **E3 honesty spine** (`rollupProseService/Client`): item-set preservation + counts-fixed both sides; `enhanced` from server `source:"ai"` only.
- **STOP-and-surface (ADR 0004):** contradictions get surfaced, not silently resolved — but code that contradicts a ratified FR is a bug to fix toward the FR (diamond case), with the interpretation documented and any doctrine loosening left to the owner.
- **Worktrees:** NEVER prune `main` (D:\), `owner-main`, `agents/skills-sync`. `git worktree remove` often fails on Windows path length / file locks — deregister with `git worktree prune` and leave directories; they're inert.
- **Pickup-queue collector scans issue bodies + merged-PR bodies** — untickable checkboxes (classifier) nag until the owner ticks them.

## 5. Owner gates open at handover

1. Test plan Sessions 0+1 (top gate).
2. #483: tick D-1..D-6 checkboxes + final look ratification.
3. Confirm first automatic Telegram brief (11:00 UTC 2026-07-12).
4. #448 prompt-architecture decision (before any inbound channel).
5. FR-031 diamond rule: sequential sibling branch shapes currently rejected — loosen only on owner say-so.

---

**If you do only one thing first:** `gh pr list` (harvest in-flight PRs), then check the test plan, then keep the loop going per §3 — the owner's standing order is ACTIVE; do not stop to ask.
