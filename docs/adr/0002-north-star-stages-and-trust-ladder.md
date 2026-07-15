# ADR 0002: North star — staged roadmap, trust ladder, and cross-slice invariants

## Status

Accepted, with D3's blanket usage gate superseded by ADR 0005 (owner sign-off 2026-07-02, merged via PR #250). The trust ladder, spine/perimeter doctrine, stage dependency order, and cross-slice invariants remain accepted.

## Context

LifeOS's long-term goal is a Jarvis-like personal chief-of-staff: a private, area-scoped, AI-assisted operating cockpit for tasks, projects, decisions, people, planning, execution, review, and recovery — **AI proposes, the user approves**. Getting there requires many implementation slices over many agent sessions. The two failure modes this ADR exists to prevent:

1. **Autonomy creep** — capability added faster than trust is earned.
2. **Slice interference** — an early slice making a local decision (schema shape, prompt plumbing, write path) that a later slice must contradict or rip out.

This ADR freezes the staging, the autonomy model, and the forward-compatibility invariants that every future slice must obey. Mutable campaign state (which slice is active, gate evidence, decisions made mid-flight) lives in the governing epic issue, never in this file.

## Decision

### D1. The trust ladder (autonomy model)

Jarvis is a trust gradient, not a feature list. Every AI-initiated action class moves through these rungs, in order, and only on evidence:

| Rung  | Behavior                                                   | Graduation evidence                                                    |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| L0    | AI silent; rule-based only                                 | —                                                                      |
| L1    | AI proposes; user approves each instance                   | default for all new AI judgment surfaces                               |
| L2    | AI proposes with pre-filled default; one-tap approve       | sustained approval rate on `user_decisions` / `override_records` data  |
| L3    | Auto-execute reversible actions with undo + audit + digest | ~zero override rate over a meaningful decision count, per action class |
| never | Irreversible/external destructive actions never pass L2    | —                                                                      |

Graduations are per **action class**, recorded as dated decisions in the governing epic (or a follow-up ADR), justified by decision data the system itself collected. No slice may ship at L2+ on day one.

### D2. Spine and perimeter

LifeOS is the **spine**: the sole holder of action truth and approval gates. Everything else is **perimeter**, connected through narrow one-way interfaces:

- **Perimeter capture channels** (e.g., a self-hosted agent gateway such as Hermes, messaging bridges): may POST raw text to the capture endpoint only. No tokens, no write authority, no read access. Injected/hostile input lands as an untrusted capture item in triage — that containment property is load-bearing.
- **Notion (Stage 2)**: one-way, one-time migration into LifeOS tables (action truth), Area Charters / Operator Profile (identity content), or archive (everything else). **No bidirectional sync with any external system, ever.**
- **Sibling systems** (agentic engineering pipeline, venture validation): share doctrine, never become app features.

### D3. Staged roadmap

| Stage | Name                     | Contents (summary)                                                                                                                                                             | Entry gate              |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 0     | Cockpit (built)          | capture→triage→plan→execute→review, approval-gated calendar, health, audit                                                                                                     | —                       |
| 1     | Chief-of-staff nouns     | people + commitments + waiting-on aging; Area Charters + Operator Profile; calendar-load-aware daily focus; daily brief; wins log; rollup summaries; learning-loop consumer v1 | epic #243 CLOSED        |
| 2     | Memory & knowledge       | Notion one-way migration; knowledge–action links; SQL-based "ask your cockpit"; playbook detection                                                                             | Stage 1 usage gate      |
| 3     | Perimeter senses & hands | perimeter capture channels; consent-based meeting capture; staged external writes (draft-for-approval messages)                                                                | Stage 2 usage gate      |
| 4     | Earned autonomy          | L3 graduations for proven action classes                                                                                                                                       | per-class evidence (D1) |

**Usage gate**: a stage's features must show up in the owner's real weekly usage (measured from the system's own data) before the next stage may start. Building ahead of habit is prohibited — the system must never become the hobby.

### D4. Forward-compatibility invariants (binding on every slice)

Slice issues cite these by ID. Violating one requires stopping work and recording a dated decision in the governing epic before proceeding.

- **NS-INV-1 — One context-assembly choke point.** All personalization context injected into AI prompts (area charter, operator profile, rollups, people context) flows through a single assembly module. Later slices extend it; no slice wires its own prompt-context plumbing.
- **NS-INV-2 — Additive-only schema within an epic.** No slice alters, renames, or repurposes a column/table introduced by an earlier slice of the same epic. Target schema shapes are specified up front in DATA_MODEL.md by the epic's contract slice; later slices only add.
- **NS-INV-3 — Born instrumented.** Every new AI judgment surface writes `suggestion_records` / `override_records` (issue #235 vocabulary, stable policy identifiers) from its first merge. Trust-ladder graduation (D1) is impossible for surfaces that skipped this.
- **NS-INV-4 — No new silent write paths.** New AI-generated artifacts follow the existing pattern: propose → validate against strict schema → user approval → persist. External writes stay approval-gated per AGENTS.md rule 1.
- **NS-INV-5 — Binding touch manifests.** Each slice issue declares what it may touch (tables, packages, prompts, routes) and what it must not. Out-of-manifest changes require stopping and logging in the epic first.
- **NS-INV-6 — Sequential execution.** One slice in flight at a time, relay-ordered via the pipeline manifest (epic #243 mechanics). No parallel slices on shared surfaces.
- **NS-INV-7 — Frozen contracts.** Once a slice merges, its public contract (table columns, zod schemas, module signatures) is frozen for the remainder of the epic; changes require an epic decision-log entry and human approval.
- **NS-INV-8 — One-in-one-out.** Every new surface/table/background job names the load it retires or the reason none exists, in its PR description. Doctrine caps (no vector DB, no multi-agent runtime, no broad connectors) remain per AGENTS.md.
- **NS-INV-9 — Perimeter containment.** No perimeter component ever receives OAuth tokens, service keys, or a write path other than the capture endpoint (D2).

### D5. Process contract for stage epics

Each stage runs as one epic issue that acts as the campaign file: frozen success criterion + check evidence, slice list with dependency order, append-only decision log (issue comments), and wrong-paths section. Slice 0 of every stage epic amends REQUIREMENTS.md / DATA_MODEL.md first (AGENTS.md rule 13) and gets human review — it is the contract all later slices build against. Stage 1's epic and slices are defined in the follow-up issues referencing this ADR.

## Consequences

### Positive

- Future agents can pick up any slice cold: doctrine here, contract in REQUIREMENTS/DATA_MODEL, state in the epic, task in the issue.
- Interference class is closed by construction: sequential relay + additive-only schema + frozen contracts + one choke point for prompt context.
- Autonomy expands only where the system's own decision data proves trust — the Jarvis path without the Jarvis failure mode.

### Negative / trade-offs

- Sequential slices are slower than parallel fan-out; accepted (correctness and safety rank first).
- Up-front target-schema design in slice 0 costs planning effort and may still need amendment — amendments are allowed but must be logged, human-gated decisions, not silent drift.
- Usage gates may idle the roadmap when life gets busy; that is the intended behavior, not a defect.

## References

- AGENTS.md (non-negotiable rules; scope; architecture)
- docs/REQUIREMENTS.md, docs/DATA_MODEL.md (contracts amended per stage)
- Issue #243 (pipeline mechanics this ADR generalizes), issue #235 (learning-record vocabulary)
- ADR 0001 (server boundary)
