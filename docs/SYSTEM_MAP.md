# SYSTEM_MAP — builder orientation

<!-- One page, shrink-only in spirit: this is the "you are here" for any human or
AI taking up building/maintaining/improving LifeOS. Altitude rule applies: this
answers "what is this whole thing and how do I act in it safely" — details live
behind the links. Keep <=130 lines; if it grows, compress. -->

## What this is

LifeOS is a single-user workflow cockpit whose real purpose is anxiety
reduction: it makes the picture of a person's work visible, coherent, and
absorbable, so execution is the natural next step. The unit that must stay
healthy is the SYSTEM–PERSON DYAD, not the software: a feature that helps the
system but degrades the relationship (guilt walls, nag pressure, data dumps) is
a defect. The operator's profile (starting friction, time blindness,
overplanning, missed-block collapse) is a design input everywhere.

## The layers (system of systems)

1. **Product spine** — capture → AI parse → triage → plan → approval-gated
   calendar write → execute → review → health. Sole holder of action truth and
   approval gates. Everything external is perimeter via narrow one-way
   interfaces (ADR 0002); sibling systems (agentic engineering, venture
   validation, later Hermes-as-partner) never merge into the spine.
2. **Doctrine** — the canonical docs (below) plus ADRs. Scope expansion starts
   in `REQUIREMENTS.md`, never in code. Merged contracts are frozen; conflicts
   are surfaced, never silently resolved.
3. **Delivery apparatus** — two implementation lanes (Codex cloud via manifest
   kicks; local Claude subagents in isolated worktrees) + CI guard tests +
   watchdogs (stranded-delivery, migration drift, provider canary, Main Red
   Guard) + `pnpm status` (owner queue). Deterministic guards enforce what
   review would otherwise have to remember.
4. **Learning loops** — suggestion/override records with stable policy ids →
   recalibration + override-pattern scans → trust-ladder graduation (L0–L3,
   propose → auto). Demotion must be automatic (override spike relegates a
   graduated class). Autonomy is earned from decision data, never assumed.
5. **Meta-learning** — `FAILURES.md` (what broke) + `PLAYS.md` (what worked) →
   quarterly distillation (#289) promotes patterns to doctrine and compresses
   the chronicles. Capability lives in artifacts; trust lives in gates.

## Where truth lives

| Kind of truth              | Location                                                      |
| -------------------------- | ------------------------------------------------------------- |
| Agent governance           | `AGENTS.md` (authority), `CLAUDE.md` (Claude entry)           |
| Requirements / scope       | `docs/REQUIREMENTS.md` (FR-001..; non-goals are binding)      |
| Architecture decisions     | `docs/adr/` (0002 north star + trust ladder; 0003 UX moments) |
| Data shapes                | `docs/DATA_MODEL.md` (target shapes = frozen contracts)       |
| Invariants + enforcement   | `docs/ENGINEERING_INVARIANTS.md` (+ guard tests in CI)        |
| UX contract                | `docs/UX_FLOWS.md`, ADR 0003, design tokens in `globals.css`  |
| Current status handoff     | `docs/PROJECT_STATE.md` (<=120 lines, replaced in place)      |
| Failure / success patterns | `docs/FAILURES.md` / `docs/PLAYS.md`                          |
| Rituals and procedures     | `.agents/skills/` (stage-contract authoring, drift response…) |
| Roadmap + vision placement | Tracker issue #293; stage cards (#292); epic bodies           |
| Work in flight             | Open PRs/issues + epic decision logs (comments)               |

## How to change things safely

1. Feature/scope change → `REQUIREMENTS.md` first (FR in house format,
   non-goals included), via a docs PR. Then contract-driven slices (issue body
   = binding contract), smallest faithful implementation.
2. Never weaken a schema, guard test, or RLS policy to make something pass.
   T2 surfaces (workflows, CI, RLS, calendar writes, security) need human
   review. Deterministic product decisions live in code/config, not prompts.
3. Ship the guard with the invariant (same PR), instrument AI surfaces from
   first merge (policy ids), and run the coherence pass (registry + UX grammar)
   before authoring new contracts.
4. Work in isolated worktrees (the main checkout is shared and moves);
   checkpoint discipline: commit per unit, push every commit.
5. When docs and reality disagree: verify against `git log` / `pnpm status`,
   then fix the doc — never build on a stale claim.

## Cold-start reading order (human or AI)

1. This file, then `AGENTS.md` + `CLAUDE.md` (budgeted entry files).
2. `docs/PROJECT_STATE.md` (current status), then a reality sweep:
   `git log --oneline -15`, `pnpm status`, open PRs/issues.
3. ADR 0002 and ADR 0003 (the two load-bearing decisions).
4. The epic/issue you are working (body = contract; comments = decision log).
5. On demand: `pnpm agent:context <area>`, the relevant skill in
   `.agents/skills/`, `FAILURES.md`/`PLAYS.md` before repeating history.

## Named principles (cite these; they are decided)

- **Operational transparency, altitude-ruled**: anxiety = uncertainty, so every
  wondering gets a picture — at the altitude of the question, never a telemetry
  dump. Two layers: one-glance answer, then drill-in.
- **Map-first operator**: every feature declares its map view; state is
  spatial/visual (color+shape+position), not lists to decode.
- **Human fallibility axiom**: errors are expected — reversible/draft-first,
  one-tap corrections, visible exits, overwhelm valves, blame-free copy.
- **Constraint over capability**: build refusals, gates, and caps before
  features; the graveyard list in `REQUIREMENTS.md` is binding.
- **Outsource the prerequisite**: AI drafts the map/plan so the operator can
  start; the operator edits through execution, not upfront grooming.
- **Trust ladder, symmetric**: autonomy graduates on evidence and demotes
  automatically on override spikes; irreversible actions never graduate.
- **One system of record**: nothing else may remember commitments — perimeter
  systems capture and deliver, only the spine holds action truth.
