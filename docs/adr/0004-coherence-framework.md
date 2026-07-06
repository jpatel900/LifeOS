# ADR 0004 — Coherence Framework: registries, guards, and the STOP-and-surface rule

- **Status:** Accepted (owner sign-off 2026-07-05)
- **Date:** 2026-07-05
- **Deciders:** jpatel900 (owner), coherence architect session
- **Amends:** ADR 0002 (trust ladder), ADR 0003 (moments architecture); extends `docs/ENGINEERING_INVARIANTS.md`, `CONTRACT_REVIEW_CHECKLIST`, the stage-contract-authoring skill

## Context

Two live contradictions proved the failure class is real, not theoretical:

- **C-0A — FR-number collision.** Two planning artifacts disagreed on what FR-022 meant (WIP enforcement on main vs task-map in a sibling plan). One artifact was updated, the other lagged; nothing failed because nothing was checking. Resolved 2026-07-05: floor claims FR-027..030, task-map renumbered to FR-031 (reserved), landed in REQUIREMENTS via #373.
- **C-0B — token triple-naming.** One two-axis color system carried three vocabularies across `globals.css`, prototype-2, and the moments plan. Resolved 2026-07-05 (owner decision): `--state-*` is the canonical state axis, mapped onto existing values; landed with moments P1 (#387). The prototype `--st-*` set is **retired** (never present in shipped `apps/web` source). Canon **now machine-enforced** (CO-4): `G-UX-3` in `coherenceRegistry.test.ts` bans raw hex color literals and off-registry `--state-*` names in every component and cockpit route, so the two-axis grammar (`--area-accent*` identity + closed `--state-{ok,watch,risk,idle,warn}` state) cannot silently re-drift; it superseded the narrower `sourceOfTruth` cockpit-hex check.

Drift here is propagation lag: a fix or naming decision lands in one artifact and silently misses its siblings. For a single-operator system whose usability depends on one grammar everywhere (owner is map-first; a shortcut/color/word must mean one thing on every screen), this is the fastest way both the codebase and the UX rot.

## Decision

Adopt a two-layer coherence framework that **extends existing artifacts — never parallelizes them**:

1. **FUNCTIONAL layer — `docs/coherence-registry.json`.** One entry per SHIPPED FR (mirror of REQUIREMENTS, capped by reality). Entries carry `surfaces`, `invariants`, `policy_ids`, and `interacts_with` edges (`kind: C | S | X`). **Every `X` edge must carry a `resolution_ref`** — the registry refuses to store an unresolved conflict.
2. **UX-GRAMMAR layer — named registries R3–R9** riding existing artifacts: interaction patterns (UX_FLOWS §15 + moments contracts), keyboard map (single-source `keymap.ts`, extracted from `useMomentKeyboard`), color/shape semantics (two axes only: `--area-accent*` identity + closed `--state-*` set), copy voice (UX_FLOWS §16), motion budget (`--motion-*`, 3 durations 1 ease), surface budget (one primary action per moment), and the mandatory map-view field. Rule for every new feature: **PICK from the registry or PETITION to extend it** (petition = dated decision-log entry, never a silent local invention).

### Enforcement honesty

Every guard is labeled **[implementable]** (a real test) or **[gate-only]** (judgment; a checklist step). Never claim a test where only judgment works.

| Guard          | What it asserts                                                                                                                     | Label                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| G-FUNC-1       | Every registry `fr` and edge `fr` matches a unique `### FR-NNN` heading in REQUIREMENTS; no duplicates either side. (Catches C-0A.) | [implementable]       |
| G-FUNC-2       | Every policy-id literal in code appears in `policies[]`; every `policy_ids` reference resolves.                                     | [implementable]       |
| G-FUNC-3       | Every `invariants[]` id exists in ENGINEERING_INVARIANTS.md or an ADR (`INV-*`, `NS-INV-*`, `UX-INV-*`).                            | [implementable]       |
| G-FUNC-4       | Every `kind:"X"` edge has a non-empty `resolution_ref`.                                                                             | [implementable]       |
| G-FUNC-5       | `surfaces[]` file paths exist on main (warn-only for logical surfaces).                                                             | [implementable, soft] |
| G-UX-2         | Keymap collision test over single-source `keymap.ts`.                                                                               | [implementable]       |
| G-UX-3         | No raw hex / off-registry state token in components.                                                                                | [implementable]       |
| G-UX-4         | Animation durations reference `--motion-*`; new keyframes registered in the reduced-motion block.                                   | [implementable]       |
| R3, R6, R8, R9 | Pattern choice, copy voice, surface budget, map-view answer.                                                                        | [gate-only]           |

**Green-on-land rule:** each guard must be green on main the day it lands (fix-then-guard in the same PR, or land warning-skipped, migration-drift shape). A guard that reddens main is itself a coherence failure and is reverted, not merged past.

### The STOP-and-surface rule (specializes CONTRACT_REVIEW_CHECKLIST §F)

When authoring or review surfaces a contradiction between two features, two artifacts, or a feature and an invariant — an FR-number collision, a token or keyword meaning two things, a policy id used two ways, an interaction pattern that fights another, an invariant an FR would violate — you MUST NOT silently resolve it, author around it, or pick a side to keep moving. STOP. Record it as a `kind:"X"` edge (or an open contradiction note) and surface it: a dated decision-log entry on the governing epic + tag @jpatel900. Resolution is an owner-gated decision that lands in REQUIREMENTS/the registry/the ADR **and all affected sibling artifacts together** (the C-0A lesson: a fix propagates atomically or it re-drifts). Silent resolution is itself a coherence failure.

### Maintenance ritual (bound into existing rituals, not new ones)

- **At contract authoring:** the stage-contract-authoring SKILL.md step-4 pre-draft additionally includes the registry entry for every FR the contract introduces, with its edges against every already-registered FR it touches.
- **At PR review:** CONTRACT_REVIEW_CHECKLIST gains exactly ONE coherence line (anti-bloat bound B3): FR registered; new policy ids in `policies[]`; new cross-feature interactions reflected as edges with resolutions; new UI uses only registered keymap/tokens.
- **Shrink/append discipline:** entries added when an FR is adopted, removed only when it retires.

(The ritual-document insertions themselves are packet CO-6; until it lands they are honored by convention.)

## Anti-bureaucracy bounds (binding — the options-table lesson applies to this system hardest)

- **B1** Registry mirrors shipped reality only; it cannot grow faster than the feature set.
- **B2** Registry-of-registries capped at R1–R9; no R10 without an ADR amendment.
- **B3** Exactly one new checklist line, ever.
- **B4** [implementable]/[gate-only] labels are binding; no over-claimed enforcement.
- **B5** The coherence map is generated, never edited (CO-7); stale map = regenerate.
- **B6** A red coherence guard never blocks the relay by lingering: fix-then-guard or revert.

## Consequences

- CO-1/CO-2 land the deterministic guards against this registry; CO-6 lands the ritual insertions; CO-7 generates the map view (`pnpm status` line + `scripts/coherence-map.mjs`).
- CO-3 extracts the single-source keymap; CO-4/CO-5 land the token/motion lints (the C-0B canonical `--state-*` set shipped with moments P1).
- Contradictions become CI failures or mandatory STOP events instead of silent drift; the cost is one JSON entry + edge notes per adopted FR.

## Alternatives considered

- **A standing "coherence reviewer" agent pass per PR** — rejected: LLM judgment where determinism suffices, cost scales with traffic, and it re-litigates settled resolutions instead of pointing at recorded ones.
- **Folding everything into ENGINEERING_INVARIANTS.md prose** — rejected: prose cannot be referentially checked; the registry exists precisely so CI can parse it.
- **A separate coherence tool/repo** — rejected outright: parallel bureaucracy, the exact failure mode this framework guards against (extend, never parallelize).
