# ADR 0003 — UX north star: moments architecture, desktop-first, calm + coaching

Status: Proposed (owner sign-off flips to Accepted)
Date: 2026-07-04
Owners: jpatel900 (product), agents (execution)
Amends: ADR 0002 (adds the UX layer of the north star; changes no stage gates, trust-ladder rungs, or spine/perimeter rules)

## Context

Four improvement passes over the cockpit UI (three build/cleanup passes plus a Claude
Design pass) raised visual quality and repaired state-truth defects (see
`docs/implementation-planning/lifeos-flow-audit-findings-2026-06-30.md`, whose root-cause
synthesis remains accurate), yet the owner's verdict is unchanged: the flows a user walks
through daily are far from world-class. The passes could not succeed because they polished
rooms in the wrong floor plan:

1. **The navigation is the database schema.** Capture → Triage → Plan → Execute → Review →
   Health renders the system's internal state machine as seven sequential destinations. A
   real day has about three moments, not seven stages. No amount of per-screen polish fixes
   a structure that makes the user walk the pipeline.
2. **Quality was defined as "tests pass," never "feels right."** The guard suite protects
   workflow truth (correctly), but no artifact encoded taste, latency, or interaction
   standards, so agent passes converged on correct-but-lifeless.
3. **The Operator Profile (ADR 0002) is an unused UX spec.** Starting friction, time
   blindness, and missed-block collapse are doctrine-level facts about the user that the
   UI does not yet structurally compensate for. That compensation — not generic polish —
   is what world-class means for this product.

Owner decisions recorded 2026-07-04: desktop-first; restructure around moments; taste
benchmarks = Things 3 (calm, minimal) + Superhuman (speed, coaching); design work starts
now, structural build starts after epic #325 closes.

## Decision

### D1 — Moments architecture

The product is organized around three daily moments, with **Today** as the single home:

- **Start** (morning): what matters today, what is scheduled, what is waiting; ends with
  one committed first move.
- **Flow** (during work): exactly one current block; capture-anything without leaving;
  derailment always renders a recovery proposal.
- **Close** (evening): a two-minute review that ends the day cleanly.

Capture, Triage, Plan, Execute, and Review become **surfaces within moments** (overlays,
sheets, inline panels) rather than navigation destinations. Health remains a truth surface
reachable from Today. The seven-stage router stays alive underneath until the moments
structure reaches journey parity (see D5), then the stage-as-destination chrome is removed.

### D2 — Desktop-first, keyboard-led

The desktop browser is the primary surface. Binding consequences: a global capture
affordance reachable in at most one keystroke from anywhere; a command palette for every
action; full flows completable without the mouse. Mobile remains functional but is not the
design driver in this phase.

### D3 — Taste contract: calm surfaces, coaching behavior

- **Calm (Things 3):** quiet surfaces, generous whitespace, minimal chrome, no
  dashboard-for-dashboard's-sake. The system must reduce cognitive load, never add it
  (ADR 0002's stated fear is the anti-goal here).
- **Coaching (Superhuman):** at any point the UI proposes exactly **one** next action,
  prominently; everything else is subordinate. Perceived interaction latency stays under
  ~100 ms; transitions are instant-feeling, never decorative.

These two are compatible precisely because coaching removes the need for chrome: a screen
that knows the next action does not need seven tabs.

### D4 — Operator Profile as binding UX rules

- Starting friction → the committed two-minute first move is the single prominent CTA at
  day start.
- Time blindness → time renders as countdowns and remaining-budget, not bare clock times.
- Missed-block collapse → every derailed state (missed, stuck, overrun) renders a one-tap
  recovery proposal; dead-end states are defects.

### D5 — Process and quality bar

- **Prototypes before implementation.** Two to three disposable prototypes of Today/Start
  and Flow are built and judged against this ADR before the cockpit is touched. Prototypes
  are throwaway by contract; none of their code is merged.
- **One structural pass, after epic #325 closes**, sequenced with the hot-file rules
  (`LifeOSCockpit.tsx` / `WorkflowContext.tsx` land one change at a time).
- **Quality bar for the pass:** the three moment journeys covered by E2E tests
  (start-to-first-move, capture-during-flow, derail-to-recovery, close-day), plus a
  UX-invariant checklist review against this ADR. Render parity alone is insufficient —
  that bar is what allowed four passes to "succeed" without helping.
- All existing truth guards (workflow reachability, health truthfulness, docRegistry,
  approval gates) remain binding and unchanged.

## UX invariants (UX-INV)

1. **UX-INV-1 — One primary action.** Every screen state has exactly one visually primary
   action.
2. **UX-INV-2 — Capture distance.** Capture is reachable in ≤1 keystroke (desktop) from
   any state, without losing the current context.
3. **UX-INV-3 — No dead ends.** Every state renders at least one forward action; derailed
   states render a recovery proposal.
4. **UX-INV-4 — Countdown time.** Active work renders remaining time, not wall-clock time.
5. **UX-INV-5 — Nav depth.** Any moment surface is ≤2 interactions from Today.
6. **UX-INV-6 — Truth-bearing surfaces stay live.** No static copy on surfaces that assert
   system state (already enforced; restated as a UX rule).

## Non-goals (this phase)

- Mobile-first redesign, native apps, offline-first work.
- New product intelligence, new tables, or Stage-1 feature pull-forward (Stage gates in
  ADR 0002 are untouched).
- Deleting the stage router before moment-journey parity is proven by E2E.
- New pipeline/tooling machinery (delivery apparatus stays frozen per owner decision D4 of
  2026-07-04).

## Consequences

- The next UI epic is a structural change with a contract (this ADR), not another polish
  pass; its slices follow the stage-contract authoring skill like any other epic.
- Some existing E2E specs that assert stage-as-destination chrome will be rewritten as
  moment-journey specs in the same slice that changes the structure — contract updates,
  not test weakening.
- Claude Design / design-tool passes become executors of this contract rather than
  unconstrained explorations.
