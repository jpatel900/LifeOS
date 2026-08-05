# PROGRAM: The Final UX Loop

**STATUS: LIVE — this is the governing program.** While it runs, the board's priority order comes from here (owner directive 2026-07-26). Repo home since 2026-08-04; the out-of-repo planning folder is provenance-only.

Owner directive (2026-07-26, verbatim intent): "We have done this loop so many times but it still doesn't turn out as we want — do it so properly this time that this will be the last ever. Step by step, strategic and structured." This document IS the structure. It supersedes ad-hoc fix queues.

## 1. Why the previous loops did not converge (named honestly, from the record)

1. **Fixes were correctness-gated, not experience-gated.** 23 green merges while the core loop was invisible (07-13 finding). The experience gate was added as a rule but applied per-PR, never per-dimension.
2. **The loop measured at the start, not at the end.** The 07-13 audit spawned 8 remediation items; all shipped; the re-measure (#586) was waived. Items checked ≠ bar cleared. The loop was open, not closed.
3. **"Good" was never written down per dimension.** Without an explicit, testable definition of what 9-10/10 looks like for, say, Mobile, every fix batch stopped at "better," and better drifted back.
4. **Nothing pinned the wins.** Fixed experience regressed silently because no guard held it (contrast: the plain-language guard's strict-equality pin took copy debt 151 → 71 and it NEVER comes back — the one mechanism in this repo that provably converges).
5. **File-tier evidence stood in for felt reality.** The calendar was dead for two months while every code-side sweep said fine. Only real clicks found it.
6. **Polish and structure fought for the same queue.** Polish froze (correctly) for architecture, then never systematically resumed — the freeze had no thaw condition.

Every rule in §3 exists to kill one of these. That mapping is the strategy.

## 2. The shape of the program

```
Phase 0  MEASURE      (done)     Audit v2, same 11-dimension rubric → scorecard + findings
Phase 1  DEFINE       (done)     Per-dimension target + written "what 10 looks like" criteria → RATIFIED TARGET CARD
Phase 2..N CAMPAIGNS  (agents)   One dimension-cluster at a time, dependency order:
                                 contract → fix → experience-gate → PIN (guard) → re-score THAT dimension
Phase F  CLOSE        (owner)    Full re-audit (all 11) + owner U3 hour = the only two keys that end the program
```

**The terminal condition — what makes this the LAST loop:** the program does not end when work ships. It ends when (a) a full re-audit scores every dimension at or above its ratified target, AND (b) the owner's U3 hour of real use (the scripted hour in the owner's test plan) confirms it _feels_ right. Both keys, no exceptions. Until then the program is open and owns the priority queue.

## 3. Rules of engagement (each rule ↔ the failure it kills)

- **R1 (kills #3):** Before any fix work, every dimension gets a written TARGET CARD: target score, and 3-7 concrete, checkable criteria defining it, drafted by the driver agent from the audit, RATIFIED by the owner in one sitting. No campaign starts on an unratified card. → `docs/program/target-cards.md` (ratified 2026-07-26).
- **R2 (kills #2):** A campaign is closed ONLY by re-scoring its dimension against the card — a mini-audit drive of just that dimension, by a fresh-eyes agent that did not implement the fixes. Score below target → campaign continues. No "done by checklist."
- **R3 (kills #4):** Every criterion that passes gets PINNED the day it passes: a Playwright experience test, a guard test, or an entry in the standing audit script that CI runs. Pinned = can never silently regress. The pin ships in the same PR as the fix or the campaign isn't closed.
- **R4 (kills #1):** Every campaign PR carries the experience gate: the implementing lane drives the flow, screenshots it, and judges feel — and the closing re-score is done by a DIFFERENT agent (implementer never grades their own work).
- **R5 (kills #5):** All scoring happens at the running-build tier, desktop + 390px mobile. File reads prove nothing about experience. Prod-only defects count double — they're what the owner actually hits.
- **R6 (kills #6):** Dependency order is law: Structure → Truth → Flow → Polish. Polish campaigns are LAST and have an explicit entry condition (all structural/truth campaigns closed), so the thaw is defined, not vibes.
- **R7 (amended by owner 2026-08-05; was "one implementation lane at a time"):** Concurrent implementation lanes are allowed when each lane has claimed its issue and declared a file manifest, and the manifests are disjoint (overlap → COLLISION protocol in `docs/agent/LANES.md`; second lane waits or renegotiates). Hot-file surfaces (the LANES.md red zones plus any files two campaigns both touch) stay single-lane. Merges still serialize through the queue — CI and the Main Red Guard own integration truth. Within one lane, a driver may parallelize its own subagents freely inside the lane's manifest. Read-only audit/score lanes remain unrestricted. All other repo rules (lane playbook, guards sacred, plain-language pin) apply unchanged.
- **R8 (scope honesty):** New feature work is frozen while the program runs, except: 737-A durability slices (they ARE the Trust dimension's campaign) and P0 production incidents. Anything else queues behind Phase F.

## 4. Campaigns (final composition, set by the Phase 0 scorecard and the ratified Target Cards)

Ordered by dependency, not by score. (An earlier draft of this section listed seven clusters with different numbers; the scorecard merged mobile+accessibility into one pins campaign and payoff+polish into one closing campaign. This list is the canonical one — it matches §6 and the Target Cards.)

- **C1 Trust & state truth** — sessions, durability, resurrecting work, close verdicts, honest Health. **CLOSED 2026-07-30 at 10/10.**
- **C2 Structure & navigation** — one shell: port all four legacy screens into moments language, sign-in door, URL truth. **IN FLIGHT.**
- **C3 First-run & onboarding** — new-account ritual to first capture. (Open OWNER-GATE: ritual content — gates C3's close only.)
- **C4 Flow completeness** — capture/triage/plan/execute residual contract gaps.
- **C5 Pins for mobile & accessibility** — hit-targets, axe-at-AA in CI; cheap, high ratchet value; may interleave.
- **C6 Payoff & polish** — completion payoffs, premium pass; entry condition: C1-C5 closed.

## 5. Owner touch-points (batched, minimal, decisive)

1. **Ratify the Target Card** — DONE 2026-07-26 (targets locked: Trust 10, rest 9; legacy screens = port all four; settings door = require sign-in).
2. **Per-campaign close sign-off** — a 5-minute glance at the re-score evidence, not a work session.
3. **Onboarding ritual content — DECIDED 2026-08-05:** the existing plan (`docs/implementation-planning/plan-onboarding-ritual.md`) is ratified as-is; the owner judges the built result at C3's experience gate. C3's close no longer waits on any owner decision.
4. **U3 hour** — Phase F's second key. Cannot be delegated. Precondition (recorded 2026-08-05, previously owner-folder-only): the scripted U3 test plan in the owner's plans folder predates the C2 legacy-screen ports — it needs a refresh pass against the current build before the hour is run.

## 6. Program state (live — update at every checkpoint; newest first)

> ## ★ CAMPAIGN C1 (TRUST) — **CLOSED 2026-07-30, 10/10 (6/6)** ★
>
> Trajectory: 3.5 (baseline) → 7.5 (R1) → 8.75 (R2) → **10 (R3)**. Round-3 judge (issue #737, "ROUND 3" comment): all six criteria PASS with driven evidence, pins mutation-verified independently, criteria 3+5 driven at 390px. Held by: per-surface phrase guards, session write-at-end pins, capture status guards, daily-close idempotency (DB + e2e), grants static guard + authenticated RLS tests, five-noun durability pins including the first account-tier Playwright pin riding migrations-rls.
> **Residual (infrastructure):** give the CI `e2e` job a Supabase-env leg so all six criteria get the seam-free signed-in tier.

- **2026-08-05 — S2 RE-LANDED AND MERGED (#840), S3 resumed:** the revert's mechanism was found, not papered over — sorting a capture to "Do today" already mints a pending proposal, so the drafted block's accept correctly supersedes it; the spec's bare row-counts only ever passed by a persistence race. Fix strengthened the spec to identity assertions (drafted row accepted, triage row superseded, block points at the accepted id) and pinned an unpinned test clock. Full floor green locally (2552 unit / 7 signed-in / 156 default e2e) + all four required CI checks on the merged head. S3 Review-port lane relaunched from its pushed checkpoints (#809, head 4857b68f at resume; zero file overlap with S2's changes verified before launch).
- **2026-08-05 — parked owner calls cleared (owner, same sitting):** onboarding ritual content DECIDED — the existing plan ratified as-is, owner judges the built result at the experience gate; C3's close gate is clear. The #764 fake-"partial" rows gate closed as a no-op (prod verified: zero such rows). KNOWN_ISSUES' update-coupling rule kept, owner-affirmed.
- **2026-08-04 — C2 in flight, one setback:** S0 sign-in door landed (#803). S2 Plan-surface port merged (#804) but its own truth spec failed on main twice; Main Red Guard revert #806 is armed to take main back to #803 — S2 re-lands with the fix. S3 Review port is drafted (#809) and waits behind the S2 re-land. The skill-hub sync (#805) was swept up in the same revert and re-lands separately.
- **NEXT: C2 STRUCTURE** (card 2, IA 5.0→9): port ALL FOUR legacy screens (owner-ratified; preserve hour-rail placement, unplan, proposal accept/reject/nudge, Google approval, planned-vs-actual, policy proposals), require-sign-in door on /settings/areas. Slice plan: `docs/program/campaign-c2-structure.md`.

<details><summary>History (2026-07-26 → 2026-07-30, oldest first)</summary>

- Phase 0 DONE 2026-07-26: audit v2 delivered (PR #757, closes #586). Overall 4.2 → 5.0. Big structural wins (Mobile 3→6.5, A11y 4→7.5, Capture 4→7, IA 2.5→5) but five new P0s in the trust/flow cluster and #758 (audit-trail loss + Health false all-clear).
- Phase 1 RATIFIED 2026-07-26 (as-is): targets locked (Trust 10, rest 9). Owner decisions: legacy screens = PORT ALL FOUR; settings door = REQUIRE SIGN-IN. Open OWNER-GATE: onboarding ritual content (gates C3 close only).
- C1 waves merged 2026-07-26: #756 (S2 durability), #757 (audit), #760 (#759 capture-sync fix), then #762 (audit trail + Health honesty — root cause: grants never granted in the original May migration for three tables), #763 (scan-guard flakes), #764 (session truth, write-at-end design), #765 (a11y pins), #766 (playbook clause 9). Owner verified in prod: /health signed-in reports truthfully.
- Remaining C1 work (P0#3 capture-status truth, P0#4 close-verdict, S3 plans/drafts, S5 truth reconciliation) landed across 2026-07-27..30; C1 closed by fresh-eyes rounds R1→R3 (see banner). Open OWNER-GATE from #764 (merged): backfill or leave historical fake-"partial" session rows — left as-is until the owner says otherwise.

</details>
