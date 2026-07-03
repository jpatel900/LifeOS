---
name: lifeos-stage-contract-authoring
description: Use when a north-star stage usage gate opens (ADR 0002) and the next stage's contract + slice barrage must be authored. The stage-boundary ritual - turns the stage card into an executable epic against current main.
---

# lifeos-stage-contract-authoring

## Use when

- The active stage's epic is closed and its usage-gate metrics (defined on the next stage's stage card) are met.
- The owner explicitly kicks a stage-boundary session.

Do NOT use to file issues for stages beyond the next one (rolling-wave rule: full barrage for the active stage only, one non-binding stage card for the stage after, nothing beyond — see ADR 0002 D3/D5 and tracker issue #293).

## Why this exists

Issues written far from execution rot: PR #227 died against a drifted main; contract quality decays with distance from the code it constrains. Every stage's contract is therefore authored fresh, at the boundary, against current main — never in advance.

## Steps

1. **Gate check.** Evaluate the usage-gate metrics from the stage card with SQL over the system's own tables (suggestion_records, override_records, user_decisions, usage surfaces). Paste the evidence into the stage card. If the gate is not met, STOP — that is a product signal, not an obstacle.
2. **Boundary review.** Run `docs/skills/next-phase-gate-review.md` for the stage boundary. Resolve "Blocked" verdicts before proceeding.
3. **Harvest.** Read: previous epic's decision log + wrong-paths comments; docs/FAILURES.md; override/suggestion pattern data; the stage card's open questions and inputs list. Answer every open question or escalate it to the owner.
4. **Author the contract (S0 content).** Against current main, pre-draft: FR text (numbered, MUST/SHOULD, non-goals), column-level target schema shapes for the entire stage (NS-INV-2: later slices only add), pinned constants/thresholds, pinned module paths, UX flow notes. This becomes the S0 issue's binding appendix — S0 executes as integration work, never design work.
5. **File the epic + slices.** Epic body = campaign file: frozen success criterion with check command, relay table with dependencies, a section titled exactly "Standing agent rules for every issue in this epic" (pipeline-advance.yml kick comments reference that heading verbatim), operating loop, manifest cutover JSON block. Slice issues carry binding touch manifests (NS-INV-5) and cite invariants by ID.
6. **Wire the machinery.** Update the pipeline driver scheduled-task prompt to the new epic number; confirm the cutover block matches pipeline-manifest.json schema; file the next stage's stage card (non-binding) and update tracker #293.
7. **Log.** Decision-log comment on the new epic: gate evidence, harvest summary, contract decisions that diverge from the stage card.

## Rules

- Sequential relay only (NS-INV-6); one slice in flight.
- All git work in an isolated worktree, never the shared checkout.
- The stage card is planning context, not a contract; where they conflict, the freshly authored contract wins and the divergence is logged.
- Do not weaken any invariant (NS-INV-1..9) to make a slice easier; invariant changes require an ADR amendment with owner sign-off.

## Non-goals

- Implementing slices (Codex does that via the relay).
- Re-litigating doctrine (ADR 0002 owns it).
- Filing issues beyond the rolling-wave horizon.
