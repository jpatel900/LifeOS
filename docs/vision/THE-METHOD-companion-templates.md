# THE METHOD — COMPANION: Templates, Checklists, Worked Examples

Pairs with THE-METHOD-self-sustaining-systems.md. That file is the doctrine;
this file makes it executable by a mid-tier human or AI. Copy the templates
verbatim; fill the brackets; do not improvise structure.

**How much detail is "enough"? The method answers its own question:** enough
detail is whatever lets the succession drill pass (a mid-tier executor
proceeds correctly from artifacts alone). When an executor stalls or errs,
add detail exactly THERE — never encyclopedically everywhere. Detail is
pulled by observed failure, not pushed by anxiety. This companion covers the
gaps we already know from experience; discover the rest through use.

---

## T1 — North-Star Decision Record (Phase 1; the constitution)

```
# ADR-0001: North star, stages, and trust ladder
Status: Proposed | Accepted        Date: [date]        Owner: [name]

## Purpose (from Phase 0)
- One-liner: [system exists to ___ for ___]
- Unit of survival: [the relationship between ___ and ___]
- Operator/stakeholder profile: [3-5 named traits + compensation rule each,
  e.g. "starting friction → system always offers a 2-minute first move"]

## D1. Trust ladder (per ACTION CLASS, not per feature)
L0 human does it | L1 system proposes, human approves | L2 system acts,
human notified, undo available | L3 system acts silently.
Graduation: class moves up only on >= [N] consecutive accepted proposals
with override rate < [x]%. Demotion: AUTOMATIC on [k] overrides in last
[m]. Irreversible classes are capped at L1 forever: [list them].

## D2. Spine / perimeter
Spine (sole holder of action truth + approval gates): [name it].
Perimeter systems: [list], each via a one-way written contract.
Rule: no second system of record, ever.

## D3. Stages (usage-gated)
Stage 0: [smallest complete value loop] — gate to Stage 1: [measurable
usage, e.g. "used 4+ days/week for 3 weeks"].
Stage 1: [next nouns] — gate: [...]. (One non-binding card for Stage 2;
NOTHING planned beyond.)

## D4. Invariants (each ships WITH its guard)
INV-1: [statement] — enforced by [test/checklist/audit].
INV-2: ...

## D5. Change process
Scope changes amend REQUIREMENTS first. Contracts freeze on agreement.
One-way-door surfaces ([list]) always get human review.
```

## T2 — Requirement (house format; one per capability)

```
### FR-[number] — [Name]
Priority: MUST | SHOULD | LATER      Stage: [n]
Rationale: [1-2 lines: which purpose/profile trait this serves]
Acceptance criteria:
- [observable, testable statement]
- [degraded-mode behavior: what happens when the dependency is down]
Non-goals (binding):
- [adjacent thing this deliberately does NOT do]
```

## T3 — Graveyard entry

```
- [Capability]: rejected [date] because [reason tied to purpose/unit of
  survival]. Revisit only if [falsifiable condition].
```

## T4 — Work contract (issue / work order; freeze before work starts)

```
Title: [Slice id] — [outcome in one line]
CONTEXT: [2-4 lines; link doctrine, do not restate it]
DELIVERABLE: [exact artifact: files/doc/process + where it lives]
SPEC: [column-level / step-level detail; thresholds as numbers not vibes]
SCOPE FENCE: touch ONLY [paths/areas]. If the task seems to require more →
STOP and report; do not improvise. Do not delegate this task further.
VERIFY: [exact commands/checks the executor runs before claiming done]
DONE = deliverable exists + verify passes + honest report (failures stated
plainly). Uncertainty escalates; it never merges.
```

## T5 — Decision/override record (schema; instrument from first day)

```
record: { policy_id (stable string), context_ref, suggestion (what the
system proposed), decision: accepted | overridden | ignored, override_value,
timestamp, actor }
Recalibration rule: only over >= [5] samples per policy_id; applied only
after explicit acceptance. Pattern scan: same policy_id overridden >= [4]
of last [5] → auto-draft a policy-change proposal for review.
```

## T6 — FAILURES chronicle entry (fence with expiry)

```
## [date] — [one-line failure name]
Symptom → Root cause → Cost: [time/money/trust]
Fence built: [the guard/process change]
RETIREMENT CONDITION: retest when [event]; delete fence if retest passes.
```

## T7 — PLAYS entry

```
## [play name]
When: [situation trigger]. Do: [steps]. Proven: [dates/instances].
```

## T8 — SYSTEM MAP skeleton (<= 130 lines, shrink-only)

```
# SYSTEM_MAP — [name]
## What this is: [purpose + unit of survival, 4 lines max]
## The layers: [1-6 per the METHOD, one line each, adapted]
## Where truth lives: [table: kind of truth → location]
## How to change things safely: [5 numbered rules incl. doctrine-first,
   guard-with-invariant, one-way-door gates, verify-before-building]
## Cold-start reading order: [numbered list]
## Named principles: [the axioms you actually cite, one line each]
```

## T9 — Stage card (the ONE allowed forward plan)

```
Stage [n+1] — [theme]. NON-BINDING.
Usage gate to open: [3-4 measurable metrics over a fixed window].
Candidate nouns: [list]. Known constraints: [list].
Contracts get authored fresh at the boundary — never from this card.
```

---

## PHASE EXIT CHECKLISTS (deterministic; all boxes or you are not done)

**Phase 0 done when:** purpose one-liner exists; unit-of-survival sentence
exists; profile has >= 3 traits each with a compensation rule; owner said
"yes, that's me/us" to all three.

**Phase 1 done when:** ADR-0001 filled (every bracket); >= [5] FRs in house
format each WITH non-goals; graveyard has >= 3 entries (if you can't name 3
things you won't do, purpose is too vague — go back); SYSTEM MAP skeleton
committed; owner ratified doctrine explicitly.

**Phase 2 done when:** value loop runs end-to-end on a real (not demo)
case; every failure path produces a VISIBLE signal (grep for silent
catches); every one-way door has a human gate; every invariant has its
guard in the same change; decision surfaces emit T5 records; owner used it
for its real purpose at least once.

**Phase 3 done when:** work flows through T4 contracts; execution tiers
assigned (who plans vs who implements); change-control tiers written
(reversible vs one-way-door surface list); one status command/view answers
"what needs the owner"; every fence has a T6 retirement condition; a
deliberately-broken test case proves each guard actually fires.

**Phase 4 done when:** >= [5] samples exist on >= [3] policy ids; one
recalibration was proposed from data and accepted/declined explicitly; the
override-pattern scan ran and its output was reviewed; the first
trust-ladder graduation was proposed FROM RECORDS (even if declined);
demotion is wired to fire automatically (test it).

**Phase 5 done when:** FAILURES + PLAYS exist with real entries; coherence
registry links every FR to implementation + guard (a script or checklist
verifies this); distillation ritual is scheduled with an owner; SUCCESSION
DRILL PASSED: a mid-tier executor, given only the artifacts, correctly
performed one real task and one real change without private context.

---

## WORKED MICRO-EXAMPLES (shape, not spec)

**Software — a freelancer invoicing tool.** Purpose: "get paid without
dread." Unit of survival: freelancer–tool relationship (guilt-free late
invoices, not nag-driven). Spine: engagement → work log → draft invoice →
HUMAN APPROVES SEND (one-way door: external email, money) → payment watch →
gentle escalation ladder. Perimeter: accounting software receives exports
one-way; email is send-only. Trust ladder: invoice DRAFTING graduates to L2
quickly (reversible); SENDING stays L1 until override rate ~0 for N sends;
ESCALATION TONE never passes L1 (relationship-irreversible). Graveyard: no
time tracking, no CRM, no multi-user. Stage gate: don't build payment-watch
until drafting is used for 10 real invoices.

**Organization — a 3-person consulting studio.** Purpose: "deliver senior
judgment without founder burnout." Unit of survival: founder–studio
relationship. Spine: the commitment ledger (one page: every promise, owner,
date) + decision log; nothing else may record promises (email is capture,
not truth). Doctrine: rate floor, scope non-goals, client red-flag
graveyard. Delivery: founder writes T4 briefs, contractors execute,
acceptance vs brief; one-way doors = signing, pricing, public claims,
hiring (founder-only forever). Learning loop: every estimate vs actual
recorded per engagement type → recalibrated quotes proposed after 5
samples. Trust ladder = delegation ladder: contractor drafts client emails
(L1) → sends routine status updates (L2 after 10 clean approvals) → never
negotiates scope (capped L1). Succession drill: a new contractor runs one
engagement from the artifacts alone.

---

## THE THREE HONEST LIMITS (what no document can carry)

1. **Taste.** Doctrine constrains judgment; it cannot supply it. The method
   compensates: frozen contracts + gates make weak taste SAFE, and the
   succession drill detects where taste-gaps bite. Discharge taste as it
   reveals itself (worked examples, review checklists) — you cannot
   pre-write it.
2. **Ratification.** The owner's "yes, that's me" in Phase 0/1 cannot be
   templated. Everything downstream is only as true as that conversation.
3. **The first real failure.** The meta-layer is theory until it eats its
   first genuine failure. Do not skip writing the entry because the failure
   was embarrassing — embarrassing entries are the highest-value ones.

If an executor follows this companion and still stalls, THAT STALL is the
next template. Add it here. This file grows by pulled demand only.
