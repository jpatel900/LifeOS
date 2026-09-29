# PROGRAM: The Final UX Loop

**STATUS: REAL USE FIRST — preparing the 10-day trial; day 1 has not started.** Owner decision 2026-09-29 (Option A) replaces the serial campaign queue. The trial owns priority; campaign implementation C2–C6 is parked and resumes only from trial findings. This program keeps its safety rules and history. Repo home since 2026-08-04; the out-of-repo planning folder is provenance-only.

Owner directive (2026-07-26, verbatim intent): "We have done this loop so many times but it still doesn't turn out as we want — do it so properly this time that this will be the last ever. Step by step, strategic and structured." This document IS the structure. It supersedes ad-hoc fix queues.

## 1. Why the previous loops did not converge (named honestly, from the record)

1. **Fixes were correctness-gated, not experience-gated.** 23 green merges while the core loop was invisible (07-13 finding). The experience gate was added as a rule but applied per-PR, never per-dimension.
2. **The loop measured at the start, not at the end.** The 07-13 audit spawned 8 remediation items; all shipped; the re-measure (#586) was waived. Items checked ≠ bar cleared. The loop was open, not closed.
3. **"Good" was never written down per dimension.** Without an explicit, testable definition of what 9-10/10 looks like for, say, Mobile, every fix batch stopped at "better," and better drifted back.
4. **Nothing pinned the wins.** Fixed experience regressed silently because no guard held it (contrast: the plain-language guard's strict-equality pin took copy debt 151 → 71 and it NEVER comes back — the one mechanism in this repo that provably converges).
5. **File-tier evidence stood in for felt reality.** The calendar was dead for two months while every code-side sweep said fine. Only real clicks found it.
6. **Polish and structure fought for the same queue.** Polish froze (correctly) for architecture, then never systematically resumed — the freeze had no thaw condition.

The rules in §3 retain those lessons. The 2026-09-29 decision puts real use ahead of more scoring rounds.

## 2. The shape of the program

```
Phase 0  MEASURE      (done)     Audit v2, same 11-dimension rubric → scorecard + findings
Phase 1  DEFINE       (done)     Per-dimension target + written "what 10 looks like" criteria → RATIFIED TARGET CARD
NOW      PREPARE      (agents)   FR-049 deployed + production capture/Sort truth
NEXT     REAL USE    (owner)    10 days using the core loop; record one line a day
THEN     LEARN       (agents)   Measure the trial; choose one bounded repair from the biggest friction
LATER    CAMPAIGNS              Resume only from trial findings; no automatic serial queue
```

**Priority now:** real use, not a target score, decides the next work. The original full re-audit and owner U3 hour remain the program's later completion gates; neither blocks the trial. An open program no longer owns the queue. C2's pending owner glance is described in §5.2; the trial contract is in §7.

## 3. Rules of engagement (each rule ↔ the failure it kills)

- **R1 (kills #3):** Before any fix work, every dimension gets a written TARGET CARD: target score, and 3-7 concrete, checkable criteria defining it, drafted by the driver agent from the audit, RATIFIED by the owner in one sitting. No campaign starts on an unratified card. → `docs/program/target-cards.md` (ratified 2026-07-26).
- **R2 (kills #2; amended 2026-09-29):** C2 awaits only the owner's five-minute glance in §5.2; no more C2 re-score rounds. Other campaigns resume only from trial findings. If resumed, their target cards and independent experience evidence still govern acceptance; a low score alone does not restart the build queue.
- **R3 (kills #4):** Every criterion that passes gets PINNED the day it passes: a Playwright experience test, a guard test, or an entry in the standing audit script that CI runs. Pinned = can never silently regress. The pin ships in the same PR as the fix or the campaign isn't closed.
- **R4 (kills #1; amended 2026-09-29):** Product changes still need experience evidence and independent acceptance. C2's pending owner glance replaces its further re-score rounds. No campaign implementation starts without a trial finding; implementers never grade their own work.
- **R5 (kills #5):** All scoring happens at the running-build tier, desktop + 390px mobile. File reads prove nothing about experience. Prod-only defects count double — they're what the owner actually hits.
- **R6 (kills #6; amended 2026-09-29):** Keep dependency order when trial findings justify work: Structure → Truth → Flow → Polish. The old serial queue is parked. C6 still requires C1–C5 to be closed, plus a trial finding that warrants the work.
- **R7 (amended by owner 2026-08-05; was "one implementation lane at a time"):** Concurrent implementation lanes are allowed when each lane has claimed its issue and declared a file manifest, and the manifests are disjoint (overlap → COLLISION protocol in `docs/agent/LANES.md`; second lane waits or renegotiates). Hot-file surfaces (the LANES.md red zones plus any files two campaigns both touch) stay single-lane. Merges still serialize through the queue — CI and the Main Red Guard own integration truth. Within one lane, a driver may parallelize its own subagents freely inside the lane's manifest. Read-only audit/score lanes remain unrestricted. All other repo rules (lane playbook, guards sacred, plain-language pin) apply unchanged.
- **R8 (scope honesty; amended 2026-09-29):** New feature work stays frozen. FR-049 is the sole feature exception; it supersedes the old 737-A and P0 feature carveouts during the trial. A production fault that blocks the trial may receive a narrow repair; that is not another feature exception. No other LifeOS building runs during the 10 days unless the trial itself hits a blocker.

## 4. Campaigns (final composition, set by the Phase 0 scorecard and the ratified Target Cards)

Implementation is parked; trial findings are the only resume trigger. C2 remains marked in flight solely for its pending owner glance, not active building or re-scoring. This list matches `campaigns.json` and retains the original dependency order.

- **C1 Trust & state truth** — sessions, durability, resurrecting work, close verdicts, honest Health. **CLOSED 2026-07-30 at 10/10.**
- **C2 Structure & navigation** — one shell: port all four legacy screens into moments language, sign-in door, URL truth. **IN FLIGHT — owner glance pending only (§5.2).** Implementation and re-scoring are parked; further work requires a trial finding.
- **C3 First-run & onboarding** — new-account ritual to first capture. **QUEUED — parked until trial findings warrant work.** Ritual content remains decided (§5.3); the owner's experience and adoption gate is unverified.
- **C4 Flow completeness** — capture/triage/plan/execute residual contract gaps. **QUEUED — parked until trial findings warrant work.**
- **C5 Pins for mobile & accessibility** — hit-targets and accessibility proof. **QUEUED — parked until trial findings warrant work.**
- **C6 Payoff & polish** — completion payoffs, premium pass. **QUEUED — parked until trial findings warrant work; C1-C5 must also be closed.**

## 5. Owner touch-points (batched, minimal, decisive)

1. **Ratify the Target Card** — DONE 2026-07-26 (targets locked: Trust 10, rest 9; legacy screens = port all four; settings door = require sign-in).
2. **C2 owner glance — PENDING:** five minutes to look at the shipped structure and existing evidence, then give the campaign-close sign-off or name a blocking issue. No more C2 re-score rounds. C2 is not closed before this glance; it does not delay trial preparation or day 1.
3. **Onboarding ritual content — DECIDED 2026-08-05:** the existing plan (`docs/implementation-planning/plan-onboarding-ritual.md`) is ratified as-is; the owner judges the built result at C3's experience gate. C3's close no longer waits on any owner decision.
4. **U3 hour — deferred:** the original final program gate cannot be delegated. It does not gate the 10-day trial; any later use needs a plan refreshed against the current build.

## 6. Program state (live — update at every checkpoint; newest first)

- **2026-09-29 — REAL USE FIRST; TRIAL NOT STARTED:** owner chose Option A. The 10-day trial owns priority. Campaign implementation C2–C6 is parked; C2 awaits only the five-minute owner glance. No implementation or re-score round is active. Resume work only from trial findings (§7).
- **2026-09-29 — DAY-1 READINESS:** FR-049 is merged at `db968fff`; the production alias was verified at that commit, its function migration is applied, and Migration Drift is green. Part of #1026: the smoke test selected the wrong moment; PR #1036 corrects that test. The production rerun and account-save warning remain UNVERIFIED. Day 1 still requires production proof that a real capture appears on Start and Sort makes a next step.

> ## ★ CAMPAIGN C1 (TRUST) — **CLOSED 2026-07-30, 10/10 (6/6)** ★
>
> Trajectory: 3.5 (baseline) → 7.5 (R1) → 8.75 (R2) → **10 (R3)**. Round-3 judge (issue #737, "ROUND 3" comment): all six criteria PASS with driven evidence, pins mutation-verified independently, criteria 3+5 driven at 390px. Held by: per-surface phrase guards, session write-at-end pins, capture status guards, daily-close idempotency (DB + e2e), grants static guard + authenticated RLS tests, five-noun durability pins including the first account-tier Playwright pin riding migrations-rls.
> **Residual (infrastructure) — CLOSED 2026-08-03 by PR #801** (merge `d7a49b1e`; close-out recorded on #737 the same day, propagated here 2026-08-08): CI got its Supabase-env leg as a separate job, `e2e-signed-in` / check name "Playwright E2E (signed-in tier)" in `.github/workflows/ci.yml` — it boots local Supabase, applies migrations + seed, and runs the `@signed-in` specs with `NEXT_PUBLIC_SUPABASE_*` set; the ordinary `e2e` job excludes that tier by tag, and both are gated alike. Criteria 2, 3, 4 and 6 are pinned there (`tests/e2e/signed-in-account-truth.spec.ts`); criterion 1's phrase guards and criterion 5's Health honesty stay in the always-on unit job, which no env gates. The nouns deliberately left to other tiers (criterion 6's wins, rollups, drafts) are named with reasons in that spec's header.

- **2026-09-14 — C2 IMPLEMENTATION SLICES MERGED; RE-SCORE THEN IN FLIGHT:** S6 shell close-out merged in PR #880, then the remaining implementation slices landed. The machine-readable campaign registry records each slice and its merged reference. The 2026-09-29 decision ends further re-score rounds and leaves only the owner glance pending.
- **2026-09-14 — C3 technical onboarding pin merged (PR #999):** a fresh browser profile now drives real sign-in and verifies onboarding as its first post-auth screen without a document reload. This is automated technical proof only; the owner's experience and adoption gate remains unverified.
- **2026-08-06 — S3 MERGED (#809), race fix landed (#844), main GREEN on the combined head:** the Review surface is ported with identity-anchored driven evidence (three inherited "driven" tests turned out never-run and red — all spec faults, fixed without weakening); owner decision on the Review-number gate: Option A (C1-ratified meaning stays; revisit only on re-score evidence). The 08-05 incident closed: #844 fixed the drafted-proposal identity race in the product (one seam, all three main failures), and the Main Red Guard now opens HELD, DIAGNOSED reverts (#843, owner decision: notify-and-hold + stand-down + diagnosis; labels `revert:confirm`/`revert:wont-fix`). In flight: S4 Health port; e2e harness hardening (axe-pin readiness + PGRST303 settle); work-map redesign (owner feedback 2026-08-05).
- **2026-08-05 — S2 RE-LANDED AND MERGED (#840), S3 resumed:** the revert's mechanism was found, not papered over — sorting a capture to "Do today" already mints a pending proposal, so the drafted block's accept correctly supersedes it; the spec's bare row-counts only ever passed by a persistence race. Fix strengthened the spec to identity assertions (drafted row accepted, triage row superseded, block points at the accepted id) and pinned an unpinned test clock. Full floor green locally (2552 unit / 7 signed-in / 156 default e2e) + all four required CI checks on the merged head. S3 Review-port lane relaunched from its pushed checkpoints (#809, head 4857b68f at resume; zero file overlap with S2's changes verified before launch).
- **2026-08-05 — parked owner calls cleared (owner, same sitting):** onboarding ritual content DECIDED — the existing plan ratified as-is, owner judges the built result at the experience gate; C3's close gate is clear. The #764 fake-"partial" rows gate closed as a no-op (prod verified: zero such rows). The former per-update `KNOWN_ISSUES` coupling is superseded by AGENTS.md rule 6's campaign-close and monthly review.
- **2026-08-04 — C2 in flight, one setback:** S0 sign-in door landed (#803). S2 Plan-surface port merged (#804) but its own truth spec failed on main twice; Main Red Guard revert #806 is armed to take main back to #803 — S2 re-lands with the fix. S3 Review port is drafted (#809) and waits behind the S2 re-land. The skill-hub sync (#805) was swept up in the same revert and re-lands separately.
- **NEXT: PRODUCTION CAPTURE/SORT PROOF, THEN REAL USE:** establish day-1 readiness and use §7. C2's owner glance remains pending alongside this work; do not resume its re-score. Historical slice plan: `docs/program/campaign-c2-structure.md`.

<details><summary>History (2026-07-26 → 2026-07-30, oldest first)</summary>

- Phase 0 DONE 2026-07-26: audit v2 delivered (PR #757, closes #586). Overall 4.2 → 5.0. Big structural wins (Mobile 3→6.5, A11y 4→7.5, Capture 4→7, IA 2.5→5) but five new P0s in the trust/flow cluster and #758 (audit-trail loss + Health false all-clear).
- Phase 1 RATIFIED 2026-07-26 (as-is): targets locked (Trust 10, rest 9). Owner decisions: legacy screens = PORT ALL FOUR; settings door = REQUIRE SIGN-IN. Open OWNER-GATE: onboarding ritual content (gates C3 close only).
- C1 waves merged 2026-07-26: #756 (S2 durability), #757 (audit), #760 (#759 capture-sync fix), then #762 (audit trail + Health honesty — root cause: grants never granted in the original May migration for three tables), #763 (scan-guard flakes), #764 (session truth, write-at-end design), #765 (a11y pins), #766 (playbook clause 9). Owner verified in prod: /health signed-in reports truthfully.
- Remaining C1 work (P0#3 capture-status truth, P0#4 close-verdict, S3 plans/drafts, S5 truth reconciliation) landed across 2026-07-27..30; C1 closed by fresh-eyes rounds R1→R3 (see banner). Open OWNER-GATE from #764 (merged): backfill or leave historical fake-"partial" session rows — left as-is until the owner says otherwise.

</details>

## 7. The 10-day real-use trial (owner decision 2026-09-29)

**Before day 1:** FR-049 must be merged and deployed. One real capture in production must appear on Start and sort into a next step. If this fails, repair only that blocker before starting. The trial has not started; no start or end date is recorded yet.

**Day 1 (about 10 minutes):** enter three real commitments: one delayed admin task, one meaningful deliverable, and one piece of work needing several sessions. Give the delayed task a return day. Write each finish line in one sentence.

**Each day (at most 10 minutes):** open Start, do or choose the first move, and capture new thoughts. Use Close in the evening. Keep one line in a single text file: date, opened yes/no, first move done yes/no, and one friction word. This decision creates no dashboard, telemetry, reminder automation, or daily assignment.

**Resume test:** at least once, after two missed days, return and take one useful action. Pass means under two minutes with no cleanup; fail means backlog or a red state must be handled first.

**At day 10:** count days opened, first moves done, tasks, dated tasks, sessions, and day reviews. Record whether each commitment finished, moved forward, or stayed untouched; include the resume result and average daily minutes. Use only counts for any production readback.

**Decision:** pass means at least seven days opened, two of three commitments finished or clearly moved forward, one passed resume test, and daily cost at most 10 minutes. Fail means at most four days opened, two failed resume tests, or the deliverable was done the old way instead. An in-between result gets 10 more days without building. After the result, choose one bounded repair from the biggest friction and repeat. C2–C6 resume only when a trial finding warrants their work; there is no automatic next campaign.
