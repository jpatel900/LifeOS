---
name: lifeos-lane-contract
description: Use when authoring or receiving a LifeOS lane contract — the brief handed to a single implementation, fix, or sweep lane. Covers premise verification, skills, checkpointing, the validation floor, guard handling, and the report contract.
---

# lifeos-lane-contract

Per-lane mechanics. Every clause below was earned by a named failure; each carries
its one-line why. Read it as a checklist, not an essay.

**Growth rule (lineage: the retired 2026-07 AGENTS.md rule 16; the principle lives on here): clauses grow one-in-one-out.** Adding a
clause requires retiring or merging one. A new failure that an existing clause
already covers sharpens that clause's wording — it does not get its own.

## Overview / purpose

Stop hand-assembling lane contracts from the orchestrator's memory. A contract
written from memory ships wrong premises; six did in the week of 2026-07-25.
This skill is the template for the contract, and the standing rules for the lane
that executes it.

## When to use

- Authoring any implementation, fix, or sweep lane contract.
- Receiving one — read it before setup, then run the authority check (clause 2).

Companion, not overlap: `lifeos-stage-contract-authoring` is **wave-level
scoping** (stage gate → epic → slice barrage, governed by ADR 0005 —
`docs/adr/0005-staged-evolution-after-v1.md`). This skill is the
**per-lane mechanics** inside any one of those slices. Authoring a stage
boundary uses both; authoring a one-off fix lane uses only this one.

## Do not use when

- The task is a genuine one-liner with no build, test, or doc surface.
- You are scoping a whole capability wave — that is `lifeos-stage-contract-authoring`.

## Process

### 1. Evidence ladder — premise zero

`agent report < file content < running build < deployed app`. Verify every
contract claim at the **highest tier it touches**: a claim about rendered or
deployed behavior needs a render or a probe, never a grep. A drifted line number
means your repo view is stale — re-read the cited line before believing anything
built on it. _Why: all six wrong contracts asserted from a lower tier than the
claim lived at._

### 2. Authority check first, and abort honestly

Verify the contract's premises against `origin/main` (and a running build where
applicable) **before any setup or code**. On mismatch: STOP, comment the
evidence on the issue, return an abort report. Do not build the contracted thing
on a premise you just disproved. If a skill or repo doc contradicts the contract,
**say so** — the contract may be wrong; every lane that pushed back this week was
right. _Why: contracts cited reports instead of files._

### 3. Skills

Name the skills to load. Routing table lives in `AGENTS.md`; repo-local
`.agents/skills` beat general ones, and `lifeos-*` beat `agentic-*`. UI lanes
load `frontend-ui-engineering`; rendered-behavior proof loads
`browser-testing-with-devtools` or uses bounded Playwright. Cockpit UI also
reads the root-level `design_handoff_lifeos/README.md` as a historical design
reference; requirements, UX flows, ADRs, and verified shipped behavior remain
authoritative. The lane reports which skills and references it loaded and
**whether any changed a decision**. _Why: an audit found zero skill invocations
across a full session — availability is not use._

### 4. Checkpointing

`WORKPLAN.md` lives **outside the repo root** (the docRegistry guard flags root
markdown). Commit per unit. Push after the **first** commit and after **every**
commit. Never sit on more than ~15 minutes of uncommitted work. Commit before any
`git checkout <ref> -- <path>`. _Why: lost work, and a checkout that ate
uncommitted edits._

### 5. Validation floor

- `pnpm format` (write, not check) **before the first push**.
- Full `pnpm test` — scoped runs miss repo-wide guards.
- `pnpm build` — catches prerender crashes nothing else sees.
- `pnpm lint`, `pnpm type-check`, `prettier --check`.
- Vitest uses the threads pool on Windows.
- Pin calendar/clock-dependent moments in specs.
- UI work: run focused tests while iterating, then the full floor above. The
  final proof packet covers accessibility/axe, one bounded primary browser
  journey, keyboard and touch behavior, desktop and mobile viewports,
  motion/reduced-motion when changed, and a before/after visual comparison when
  appearance changes. Capture the first screenshot **and look at it**. Mark an
  inapplicable proof item `N/A` with one reason.
- Confirm no stale dev server squats the port — check the listener PID's commandline.

### 6. Guards are sacred

Never weaken, skip, or re-anchor-to-nothing a test to get green. A test asserting
removed behavior gets **re-anchored to the new truth**, not deleted. Never use an
exemption hatch (e.g. the plain-language guard's developer-layer marker) to make a
number look better. Ratchets move by **strict equality**, deliberately.

### 7. Truth mapping — copy and UX work

Before UI or copy implementation, write a compact delivery brief: objective,
intended feeling, non-negotiable invariants, and expected user-visible behavior
for loading, empty, partial, error, and success states. Cover keyboard, touch,
mobile/responsive, and motion/reduced-motion behavior; mark an inapplicable
state or input axis `N/A` with one reason. List the safety and truth guarantees
carried by the old UI/text and prove each survives, before → after. Verify every
claim of state against the code path that produces it. Where words and behavior
disagree, **STOP and escalate**: make-it-true versus say-the-truth is an owner
call, not a lane call.

### 8. Reach trace — sweeps

Phase 1 traces every item to its terminus — user-visible, caught,
classifier-load-bearing, or dead — and **posts the table before rewriting
anything**. A verified zero is a successful deliverable; record it so it stays
closed.

### 9. Report contract

Evidence-anchored only, per AGENTS.md rule 11: every "it works" claim carries
the exact command and observed output; "should" and "probably" are banned for
anything unverified. Ship an UNVERIFIED list with the **exact proving command**
for each item — and note that UNVERIFIED means *not proven*, not *not done*.
Post the report and **END** — never babysit CI; the orchestrator watches and
un-drafts.
A lane never parks itself mid-task: no Monitors, no "waiting for a
notification", no ending a turn with verification still running in the
background. Run every remaining check in the foreground, read its output, then
report and end. _Why: two lanes (2026-07-25/26) stalled at the finish line
"waiting", one losing its session before ever opening the PR — waiting is how
finished work fails to ship._

### 10. PR hygiene

Draft early. Use the literal `closes #N` keyword. Follow-ups appear **only** as
`- [ ] AGENT-TODO:` or `- [ ] OWNER-GATE:` checkboxes — never as free prose.
Owner-gates carry plain-language options with short- and long-term impact and
trade-offs.

## Common rationalizations

- "The contract says so, so it is true." Contracts are agent output — evidence tier 1. Check.
- "A grep proves the UI." It proves a string exists in a file. Nothing more.
- "I will commit once it all works." That is how the work gets lost.
- "The test was asserting the old behavior, so I deleted it." Re-anchor it instead.

## Red flags

- Setup or code started before the authority check.
- A completion claim with no command output beside it.
- A scoped test run standing in for the full suite.
- A diff that quiets a guard rather than satisfying it.
- Free-text "the owner should…" instead of an OWNER-GATE checkbox.

## Verification

- Every premise in the contract is traced to a file, build, or probe.
- The final command sequence and its literal output are in the report.
- The UNVERIFIED list names a proving command for each entry.

## Done criteria

- Contract premises verified or the lane aborted with evidence.
- Work committed and pushed per unit; validation floor run in full.
- PR drafted with `closes #N` and checkbox-only follow-ups.
- Report posted per rule 11 (evidence-anchored, UNVERIFIED list); lane ended without babysitting CI.

## Authority / safety boundaries

- `AGENTS.md`, the authority docs, and direct owner instructions override this skill.
- This skill does not authorize weakening guards, widening scope, editing ADRs,
  or bypassing the external-write, RLS, schema, or secrets rules.
- It does not authorize merging: agent self-authored PRs are OWNER-GATE (AGENTS.md rule 11 rubric).
