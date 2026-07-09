# LifeOS — Fable's Final Free-Rein Pass (2026-07-05)

One frontier-model pass over the whole system, its doctrine, its delivery
apparatus, and its future — deliberately answering the question "if you were
not bound by the rigidity we wrote for agents, what would you change?"

Placement note: nothing here jumps the queue. The active path (moments P7 →
G1 floor → S5–S9 into the new shell → Stage 2 gate) stands. Items below land
as #293 placement notes, stage-card candidates (#292), or FR reservations —
through REQUIREMENTS.md, never through code first.

---

## 0. The honest answer to the framing

"Disregard the constraints" splits the rigidity into two different materials,
and the free-rein answer is different for each:

- **Doctrine** (spine/perimeter, one system of record, usage gates, trust
  ladder with automatic demotion, the graveyard, WIP refusal) — this is not
  rigidity, it is the product. Jay's stated fear is the system becoming
  cognitive load; restraint is the differentiator. Unbound, I would rebuild
  every one of these walls in the same place.
- **Apparatus** (kick templates, patch-paste protocol v2, claim comments,
  watchdogs, contract-per-slice ceremony, model-degradation runbook) — this
  is scar tissue. Every piece is a fence around a 2026-era tool failure:
  Codex strandings, token exhaustion, weak implementer models, classifier
  quirks. Scar tissue was correct when cut, but it must not calcify into
  identity. The project should *plan to shed it*.

Everything below follows from that split.

---

## 1. SHRINK — apparatus sunset discipline

**Proposal: every fence gets a retirement condition, recorded where the fence
lives.** FAILURES.md entries gain a "retest condition" line (e.g. "when Codex
make_pr delivers 5 consecutive PRs, retire patch-paste v2"). A quarterly
apparatus review (fold into #289 distillation) asks of each fence: has the
failure it guards recurred in 90 days? If not, retest deliberately; if the
retest passes, delete the fence. The kick template, the claim-comment
protocol, the contract-volume-per-slice — all should shrink as implementer
capability rises. Principle already exists ("capability lives in artifacts,
trust lives in gates") — this is its converse: **process volume is not trust;
gates + guard tests are. When gates hold, ceremony can go.**

Concrete first candidates: patch-paste v2 wording (retest at each Codex
platform update), the single-review escalation matrix, contract appendix
length for Sonnet-class implementers, MODEL_DEGRADATION_RUNBOOK activation
status.

Why it matters: without a sunset ritual, LifeOS-the-project accretes
compensations forever, and a future maintainer (human or AI) cannot tell
load-bearing doctrine from fossilized workaround. The doc registry solved
this for documents; do the same for process.

---

## 2. EVOLVE — four seeds already planted, grown to full size

### 2a. The Initiative Ladder (the single highest-leverage idea in this pass)

The trust ladder governs what LifeOS may *do*. Nothing governs when it may
*speak*. Attention is the scarcest resource in the dyad, and every planned
surface (daily brief, aging nudges, recovery proposals, future Hermes
presence, future notifications — currently a blanket non-goal) is an
unpriced withdrawal from the same account.

**Proposal: a second ladder, parallel and symmetric to the autonomy ladder,
for interruption rights.**

- I0 — answers only when asked (ask-your-cockpit).
- I1 — surfaces at *natural moments the user initiates* (the brief, Close,
  re-entry ritual). Everything in Stage 1 lives here. Zero unprompted pings.
- I2 — may interject mid-day, but only within an explicit attention budget
  (e.g. 1/day), and only for evidence-strong classes ("the 3pm block's
  prerequisite just slipped").
- I3 — may initiate outside the app (notification, Hermes channel). Stage 3+
  only, per-class graduation, same mechanics as autonomy: graduate on
  accumulated accept-rate, **demote automatically on dismiss-spikes**.

This unifies four things currently handled ad hoc: the "no notifications"
non-goal (it's I1-cap, not a permanent never), nag-pressure-as-defect (a
dismissed interjection is an override record), the Hermes presence boundary
(Hermes speaks, LifeOS shows — Hermes inherits the I-ladder via the profile
export), and Stage 4 shadow-mode (rehearse interjections silently, measure
would-have-been-welcome rate before graduating a class).

Chief-of-staff framing: a great chief of staff is not the one who does the
most — it's the one who interrupts you *exactly* when you'd want and never
otherwise. That is a learned, per-class skill. Make it the same earned-trust
machinery you already built.

### 2b. Triage graduates first

The seven-stage spine treats triage as a permanent human stage. But triage
is precisely the decision class the trust ladder should absorb earliest:
high-volume, low-stakes, fully reversible, rich override data from day one
(#312 reject-learning already records it). **Proposal: name "auto-triage for
high-confidence capture classes" as the intended first trust-ladder
graduation** (Stage 4 brief material, FR reservation now). A capture that
parses cleanly into a known area with known shape should be *born triaged*,
with an undo affordance, once the evidence supports it. The best inbox is
the one you rarely visit; triage-the-stage remains as the exception queue.

### 2c. The Mirror — dyad vital signs as a first-class surface

#293 already notes inflow/outflow vital signs. Grow it into the system's
own health map (the "what is this feature's map view?" answer for the dyad
itself): capture inflow vs completion outflow; override-rate trend per
policy class (trust calibration curve); re-entry frequency and
latency (rupture-repair health); map-dwell vs execution time (the lingering
governor, measured). One glance answers "is this system still serving you?"

The teeth: **one-in-one-out becomes data-enforced.** A surface unused for
N weeks gets an auto-drafted demotion proposal (hide, not delete), exactly
like autonomy demotion. The system applies its own doctrine to itself. This
is also the honest Stage-2+ usage-gate instrument — gates currently depend
on self-report; the Mirror measures them.

### 2d. Moments × Map — the spatial grammar (UX north star v3)

ADR 0003 gave LifeOS its temporal grammar (Start/Flow/Close — *when* things
appear). The task node maps (FR-031 reservation) are the first piece of the
matching **spatial grammar**. Full-size version: one continuous zoomable
surface — life areas as regions (area-colored), projects as territories,
tasks as node-paths, today as the lit route through them, the current focus
block as "you are here." Zoom is the altitude rule made physical: every
zoom level answers exactly one wondering (life-level: "is anything on
fire?"; area: "what season is this in?"; project: "what's the path?"; node:
"what's the next 2 minutes?").

Staging honesty: v0/v1/v2 of the task map (already ratified) are the
evidence ladder for this. If v1 breakdown-node acceptance hits its ≥70%
gate, the zoomable life-map is the Stage 2/3-era shell successor — write it
as one paragraph in STAGE_BRIEFS.md now so the taste survives model churn.

---

## 3. ADD — new nouns the chief-of-staff is missing

### 3a. Triggers (prospective memory)

"When X happens, do Y" — *context*-conditioned intentions, not
time-conditioned ones: "next time I talk to Darpan, raise the account plan";
"when the SCE contract closes, invoice"; "if the canary opens twice in a
week, escalate." Time triggers are calendar rows; context triggers have no
home in any commercial tool, and holding them is half of what a human chief
of staff is *for*. Schema is small (trigger_condition, intended_action,
arm/fire/expire states); firing starts I1-only (surface in brief when
context plausibly matched — person-linked captures, area events). This is
the strongest Stage 2 card candidate in this document: it composes with
people/commitments (S3) and knowledge-action links, and it directly serves
the profile (offloading open loops is the deepest anxiety reduction there
is).

### 3b. Compost — refusal's gentle twin at the inbox

FR-022 says refusal is the feature at activation. The same operator trait
produces inbox dread: captures that age become guilt objects, and
inbox-guilt kills capture habits (the C7 Notion death spiral started
exactly this way). **Proposal: captures untouched for N days auto-compost —
moved to a searchable, tagged archive with explicitly guilt-free copy ("I
kept it; it's findable; it owes you nothing"), a weekly one-line compost
count in Close (not a list), and cheap resurrection (search → re-capture).**
Nothing is ever lost; nothing unprocessed may nag. This makes thought-speed
capture (G1 PWA, later Hermes channels) safe to use at volume — capture
ubiquity without triage debt.

### 3c. Seasons — the narrative layer

S7 wins and S8 rollups aggregate. One level up sits identity: quarterly,
the approved weekly/monthly rollups compose into a short evidence-backed
narrative — "this season you shipped X, held the line on Y, recovered from
Z" — wins-only framing, misses appear solely as recovered/rerouted (guilt
walls are defects). Anxiety reduction has two tenses: *today's* picture
(built) and trust in one's own track record (unbuilt). A person with
starting-friction and collapse-after-missed-block patterns needs
system-held proof that he finishes things. Nearly free: it's a fourth
altitude on the existing rollup ladder, same approval mechanics.

### 3d. Rehearsal — what-if planning

Shadow-mode rehearsal exists for Stage-4 agents; give the *person* the same
tool. Drag a hypothetical commitment onto the week (or ask: "what if I take
the RiseUp thing?") → deterministic ripple preview: which focus budgets
shrink, which waiting-ons slip, what the load rule says. No AI needed —
free/busy math + the load rule, rendered on the map. Saying *no* is the
operator's hardest move; a picture of the cost is the strongest possible
support for it. (Also the natural home of the one-in-one-out rule at
decision time, not after.)

### 3e. The Life Archive — exit as a feature

One command exports everything — tasks, decisions, wins, rollups, charters,
profile, learning records — as portable, human-readable files (markdown +
JSON). Rationale: exit-anxiety is anxiety, and the system's own doctrine
should apply at the largest scale — LifeOS must never hold the person
hostage, including to itself. Also the honest backstop for every
sustainability question: if the dyad ever stops being healthy, leaving must
be cheap. Trivial to build (it's SQL + serialization), disproportionate
trust payoff. Also doubles as the Hermes/perimeter data diet: perimeter
systems get *slices of the export format*, never DB access — the Operator
Profile export (#293) becomes v1 of this format rather than a bespoke
artifact.

---

## 4. FUTURE — strategic notes

- **Hermes**: define the Operator Profile export as a *versioned artifact of
  the Life Archive format* now (Stage 1 owns the profile; the contract is
  one page). Add one-way "focus block started/ended" events to the eventual
  contract so body-doubling presence needs zero LifeOS access. Hermes
  inherits interruption rights from the Initiative Ladder — it may never
  out-speak the trust the dyad has earned.
- **Succession fire drill**: yearly, run the cold-start reading order with a
  mid-tier model only and score whether it can safely operate + extend the
  system. Capability-in-artifacts taken to its conclusion: the system's
  long-term survival must not require frontier intelligence, mine included.
- **Scope beyond productivity**: health, finance, relationships will knock.
  The answer is already in the architecture: they enter as *areas* with
  charters, or they stay perimeter. No new subsystems, ever. Write this
  single sentence into STAGE_BRIEFS so future enthusiasm meets it early.
- **The dyad, instrumented**: every proposal above routes through the same
  two primitives — suggestion/override records and map-views-at-altitude.
  That convergence is the system's real signature. Guard it: any feature
  that can't state its override-record and its map view isn't LifeOS yet.

---

## 5. Sequencing (unchanged, with insertion points)

1. NOW: moments P7 → G1 floor → S5–S9 in the new shell. (No change.)
2. Cheap doctrine writes, this wave: FR reservations for Initiative Ladder +
   auto-triage-first + compost; STAGE_BRIEFS paragraphs for spatial grammar
   + scope-beyond-productivity; FAILURES.md retest-condition convention.
3. Stage 2 card (#292) candidates, evidence-gated: Triggers, Compost,
   Mirror v1 (instrumented usage gates), Rehearsal v0 (free/busy ripple).
4. Stage 3/4 briefs absorb: Initiative Ladder I2/I3, Hermes profile-export
   contract, Seasons.
5. Quarterly (#289): apparatus sunset review, first pass.

— Fable, final pass.
