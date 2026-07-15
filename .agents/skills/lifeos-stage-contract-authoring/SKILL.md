---
name: lifeos-stage-contract-authoring
description: Use when the owner opens a LifeOS capability wave and its structural prerequisites plus any capability-specific evidence gates are satisfied. Turns strategic stage input into an executable contract against current main under ADR 0005.
---

# lifeos-stage-contract-authoring

## Use when

- The owner explicitly kicks a capability-wave or stage-boundary session.
- Structural prerequisites are met, and any usage metrics required by the specific capability are met.

Do NOT turn strategic vision directly into code authorization. Disposition each candidate as IMPLEMENT, MERGE, REJECT with rationale, or DEFER on a named dependency; REQUIREMENTS, ADRs, and an owner-ratified issue authorize implementation. Keep issue creation rolling-wave: contract only the next approved items instead of filing a speculative backlog.

## Companion files (read the ones your step needs)

- `TEMPLATES.md` — fill-in-the-blanks skeletons for the S0 contract, stage epic, and slice issues; prior artifacts #252 / #251 / #253–#261 are illustrative shapes, not current authority.
- `STAGE_BRIEFS.md` — important strategic design input, decision rules, acceptance shapes, and named anti-patterns for Stages 2–4. Reconcile each candidate with current REQUIREMENTS and ADRs before contracting it.
- `CONTRACT_REVIEW_CHECKLIST.md` — deterministic merge-conformance rubric for pipeline PRs (used by the driver on every merge pass).
- `MODEL_DEGRADATION_RUNBOOK.md` — what tightens when frontier-model capability is unavailable (cross-model contract review, S0 owner-gate reactivation, verification prerequisites). If you are not certain you are a frontier-tier model, read it first.

## Why this exists

Issues written far from execution rot: PR #227 died against a drifted main; contract quality decays with distance from the code it constrains. Every stage's contract is therefore authored fresh, at the boundary, against current main — never in advance.

## Steps

1. **Prerequisite check.** Classify each capability. For a data-independent foundation, verify structural dependencies and owner ratification. For personalization, initiative/autonomy, proactive interruption, external channels/writes, or data-derived policy, evaluate its usage/trust evidence with the system's records and retain the applicable approval and safety gates. If a required capability-specific gate is unmet, DEFER on that named dependency; do not silently bypass it.
2. **Boundary review.** Run `docs/skills/next-phase-gate-review.md` for the stage boundary. Resolve "Blocked" verdicts before proceeding. At each stage boundary, additionally run the **full-corpus coherence audit** — regenerate the coherence map, run all coherence guards over the whole registry (not just the diff), and walk the HARMONY MATRIX for any `X` edge whose `resolution_ref` has gone stale.
3. **Harvest.** Read: previous epic's decision log + wrong-paths comments; docs/FAILURES.md; override/suggestion pattern data; the stage card's open questions and inputs list. Answer every open question or escalate it to the owner.
4. **Author the contract (S0 content).** Against current main, using the TEMPLATES.md skeletons and within the stage's STAGE_BRIEFS.md constraints, pre-draft: FR text (numbered, MUST/SHOULD, non-goals), column-level target schema shapes for the entire stage (NS-INV-2: later slices only add), pinned constants/thresholds, pinned module paths, UX flow notes. This becomes the S0 issue's binding appendix — S0 executes as integration work, never design work. Under degraded model capability, apply MODEL_DEGRADATION_RUNBOOK.md (cross-model review + owner gate) before filing.
   **4a. Coherence pass (mandatory for every FR authored).** For each FR in this contract:
   - Add its `coherence-registry.json` entry: `invariants`, `surfaces`, `policy_ids`, and an `interacts_with` edge against **every already-registered feature it touches** (walk the HARMONY MATRIX axes). Any `X` edge MUST carry a `resolution_ref` — if you cannot resolve a conflict, STOP, do not author around it.
   - Name each new interaction's **interaction-pattern** — PICK an existing one or file a petition.
   - Answer the **map-view question**: which moment hosts it, which state tokens carry its state, its collapsed/expanded map representation.
   - Confirm new copy conforms to house voice and the surface declares its budget.
5. **File the epic + slices.** Epic body = campaign file: frozen success criterion with check command, relay table with dependencies, a section titled exactly "Standing agent rules for every issue in this epic" (pipeline-advance.yml kick comments reference that heading verbatim), operating loop, manifest cutover JSON block. Slice issues carry binding touch manifests (NS-INV-5) and cite invariants by ID.
6. **Wire the machinery.** Update the pipeline driver scheduled-task prompt to the new epic number; confirm the cutover block matches pipeline-manifest.json schema; update the vision-disposition tracker and any strategic stage card without treating either as implementation authority.
7. **Log.** Decision-log comment on the new epic: gate evidence, harvest summary, contract decisions that diverge from the stage card.

## Rules

- Sequential relay only (NS-INV-6); one slice in flight.
- All git work in an isolated worktree, never the shared checkout.
- The stage card is planning context, not a contract; where they conflict, the freshly authored contract wins and the divergence is logged.
- Do not weaken any invariant (NS-INV-1..9) to make a slice easier; invariant changes require an ADR amendment with owner sign-off.

## Non-goals

- Implementing slices (Codex does that via the relay).
- Re-litigating doctrine (current REQUIREMENTS and ADRs, including ADR 0005, own it).
- Filing issues beyond the rolling-wave horizon.
