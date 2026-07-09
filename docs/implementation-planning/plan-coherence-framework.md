# Plan — System Coherence Framework (the standing mechanism that keeps the corpus aligned)

Status: Planning artifact (READ-ONLY). Author role: System Coherence Architect. Owner: jpatel900.
Ratified fear this answers: as features accumulate (existing, planned, future) they drift into functional AND UI/UX contradiction and the system becomes unusable. This designs the STANDING MECHANISM so alignment stops depending on any one session remembering to check — a feature of the *engineering system*, sibling to the doc registry and the guard tests.

Binding design principles (from the brief, non-negotiable):
- **Extend, never parallelize.** Every artifact below states which existing artifact it extends and who consumes it. No new bureaucracy — it rides docRegistry-shape guards, CONTRACT_REVIEW_CHECKLIST, the stage-contract-authoring skill, and ADR discipline.
- **Deterministic guards where possible; checklist gates where judgment is needed; STOP-and-surface for contradictions** (the S0 / checklist-F pattern — never silently resolve).
- **Map-first owner:** coherence state itself needs a map view, and "what is this feature's map view?" is a mandatory coherence question for every feature.
- **Two equal layers:** FUNCTIONAL coherence (feature interactions, invariant conflicts, data-model contention) and UX-GRAMMAR coherence (a shortcut/color/word meaning different things on different screens is the fastest way usability dies for this operator).

---

## 0. Two live contradictions this mechanism already catches (the proof it is real, not theoretical)

These were found by reading the four sibling plans against current `origin/main`. They are the owner's fear made concrete — **drift as propagation lag: one sibling artifact was updated, the other was not.** They are the load-bearing worked examples for §1 and §2. Per the STOP-and-surface rule, **this plan does NOT resolve them** — it surfaces them and shows which guard would have caught each.

### C-0A — FR-number collision (FUNCTIONAL drift)
- `origin/main:docs/REQUIREMENTS.md` currently defines **FR-022 = WIP Enforcement** through **FR-026 = Capture Containment** (the constraint layer).
- `plan-task-map-contract.md` still self-labels the task node map as **FR-022** ("### FR-022 — AI-Drafted Task Node Map") — a number now taken by WIP on main.
- `plan-daily-driver-floor.md` noticed the collision from its side and **renumbers** the floor to FR-027..030 and reassigns task-map to **FR-031** — but the task-map artifact itself was never updated to match.
- **This is exactly the failure the mechanism exists for:** two planning artifacts, one updated, one lagged; nothing failed because nothing was checking. Caught deterministically by guard **G-FUNC-1** (§1.4): every `FR-NNN` heading in REQUIREMENTS is unique, and every `FR-NNN` cited in an issue/PR/plan resolves to a real, singular requirement. Routed to STOP-and-surface (§3.3): the fix already exists inside the daily-driver plan; the mechanism's job is to force that fix to land in REQUIREMENTS + the task-map artifact *together* via a decision-log entry, not to pick a number here.

### C-0B — Token triple-naming (UX-GRAMMAR drift)
One two-axis color system, three incompatible names for it across three artifacts:
- `origin/main:apps/web/src/app/globals.css`: `--area-accent*` (area/brand identity, oklch) + `--amb-* / --blu-* / --grn-*` (state triplets, hex).
- `prototype-2-today-home.html`: `--accent` (area identity) + `--st-green / --st-amber / --st-red` (state), explicitly documented as "two color axes, kept deliberately distinct."
- `plan-moments-shell.md` §5: proposes NEW `--state-ok / --state-watch / --state-risk / --state-idle / --state-warn`.
- **Same grammar, three vocabularies.** If all three ship, a "state color" means a different token on every screen — the precise way usability dies for this operator. Caught by the color/shape registry (§2c) + its lint guard **G-UX-3** (no raw hex in components; no off-registry state token). The registry picks ONE canonical set and the guard enforces it. **Not resolved here** — surfaced as the registry's seed reconciliation task.

---

## Placement decision (arguing §1 up front, because it governs everything below)

**Recommendation: a machine-readable `docs/coherence-registry.json` + a guard test `apps/web/src/__tests__/coherenceRegistry.test.ts` + a generated human view — a faithful imitation of the pattern the repo already trusts (`docs/doc-registry.json` + `docRegistry.test.ts`).** Not prose-in-REQUIREMENTS, not a new `docs/COHERENCE.md` narrative doc.

Argument (three discriminating constraints):
1. **The deterministic guard needs machine-readable data.** G-FUNC-1/2 (unique FR ids, registered policy ids) must parse structured entries. Prose in REQUIREMENTS is not machine-checkable without inventing a fragile markdown parser; JSON is the honest fit and mirrors `doc-registry.json` exactly.
2. **docRegistry is shrink-only and allowlist-gated.** Adding a narrative `docs/COHERENCE.md` requires a deliberate entry in `CANONICAL_ALLOWLIST_EXACT` in `docRegistry.test.ts` (permitted, but it is a new canonical doc to defend forever). A `.json` data file + a `.test.ts` guard is NOT a markdown file, so it sidesteps the doc-registry surface entirely and cannot rot the entry-file line budget.
3. **Extend-don't-parallel.** The registry's *narrative* home is the HARMONY MATRIX section that `plan-daily-driver-floor.md` already pioneered — that matrix becomes a short, human-readable section appended to REQUIREMENTS (or its own ADR), and the JSON is its machine-checkable projection. One source of truth (JSON), one human view (the matrix + generated map), one guard (the test). No third bureaucracy.

So: **REQUIREMENTS holds the FR text (unchanged authority); `coherence-registry.json` holds the interaction/policy/surface graph; the guard test enforces referential integrity; the matrix + generated map are the human read-outs.** This is stated concretely in §1 and §4.

---

## Registry-of-registries (the master table — the whole framework on one screen)

Every row names what it EXTENDS and who CONSUMES it. This table is (a) the binding-principle enforcer, (b) the §4 map-view data source (the map is generated FROM this), and (c) §6's anti-bureaucracy thesis self-modeled: a capped, shrink-only registry that lists registries.

| # | Registry | Layer | Extends (existing trusted artifact) | Consumed by | Enforcement | Guard / gate location | Hard size cap |
|---|---|---|---|---|---|---|---|
| R1 | Feature-interaction registry | FUNC | daily-driver HARMONY MATRIX + REQUIREMENTS FRs + ENGINEERING_INVARIANTS | contract authors, impl subagents, PR reviewer | **det. test** (referential integrity) + checklist gate (interaction notes) | `coherence-registry.json` + `coherenceRegistry.test.ts` | 1 entry per shipped FR; matrix ≤ 1 screen/axis |
| R2 | Policy-id registry | FUNC | #235 vocabulary, existing `*.v1` policy ids | impl subagents, learning loop, gate SQL | **det. test** (every policy id in code is registered) | same JSON `policies[]` + guard | 1 row per policy id |
| R3 | Interaction-pattern registry | UX | UX_FLOWS §15 core components, moments component contracts | contract authors, UI subagents | **checklist gate** (PICK or petition) | SKILL.md step 4 + CONTRACT_REVIEW_CHECKLIST §D | ≤ ~8 named patterns |
| R4 | Keyboard-map registry | UX | moments `useMomentKeyboard.ts` §1.3 table | UI subagents | **det. test** (collision = fail) | single source file `keymap.ts` + `keymap.test.ts` | one map, no per-screen forks |
| R5 | Color/shape-semantics registry | UX | globals.css two-axis tokens + prototype-2 axes | UI subagents | **det. test** (no raw hex / off-registry token in components) | `coherenceRegistry.test.ts` lint rule (or eslint) | 2 axes only (area / state), fixed state set |
| R6 | Copy-voice registry | UX | UX_FLOWS §16 copy guidelines | contract authors, UI subagents | **checklist gate** (voice review) | UX_FLOWS §16 (extended) + checklist line | append-only banned/blessed lists, capped |
| R7 | Motion-budget registry | UX | moments §5 `--motion-*` + reduced-motion block | UI subagents | **det. test** (duration caps, motion only on state change) | tokens + `motion.test.ts` (or CSS lint) | 3 durations, 1 ease |
| R8 | Surface-budget registry | UX | UX-INV-1 / NFR-005 (six screens) | contract authors | **checklist gate** (per-moment budget) | checklist line, generalizes UX-INV-1 | one primary action / moment |
| R9 | Map-view field | BOTH | ADR 0003 moments, owner map-first doctrine | contract authors | **checklist gate** (mandatory field) | SKILL.md step 4 template field | 1 required answer / feature |

**Enforcement honesty rule (mirrors the repo's own "NOT yet wired — do not claim it" discipline for INV-6/NS-INV-1/3):** every guard below is marked **[implementable]** (a real test can be written today) or **[gate-only]** (judgment; a checklist step, never a test). Do not over-claim a test where only a human/agent judgment call works.

---
## 1. FUNCTIONAL LAYER — feature-interaction registry

**Extends:** the daily-driver-floor HARMONY MATRIX (its per-conflict-with-resolution format is the proven shape), REQUIREMENTS.md FRs (the authority for *what* a feature is), and ENGINEERING_INVARIANTS.md (INV-1..7, NS-INV-1..9, UX-INV-1..6 are the invariant vocabulary an entry references).
**Consumed by:** contract authors (at stage boundaries), implementation subagents (to know what their slice touches), and the PR reviewer (to check an entry exists and is honored).

### 1.1 Data home — `docs/coherence-registry.json`

One entry per **shipped** FR (draft FRs are not registered until adopted — keeps the registry a mirror of reality, not of intent). Shape:

```jsonc
{
  "description": "Feature-interaction + policy-id registry. Machine-readable projection of the HARMONY MATRIX. Guarded by coherenceRegistry.test.ts. Shrink-or-append-one-per-FR only; never a dumping ground.",
  "features": [
    {
      "fr": "FR-026",                       // must exist + be unique in REQUIREMENTS.md
      "name": "Capture Containment (AI-Wait)",
      "invariants": ["UX-INV-3", "NS-INV-4"],   // must be real ids in ENGINEERING_INVARIANTS/ADR
      "surfaces": ["capture", "WorkflowContext.submitCaptureText"], // file/route paths, freshness-checked
      "policy_ids": [],                      // policy ids this FR introduces; each must be in policies[]
      "interacts_with": [
        { "fr": "FR-027", "kind": "X",       // C compatible / S synergy / X conflict
          "note": "shares capture surface; online-parse => FR-026 containment, save-raw/offline => FR-027 queue; never both waiting.",
          "resolution_ref": "plan-daily-driver-floor.md §3 C5/#368 row" }  // X REQUIRES a resolution ref
      ]
    }
  ],
  "policies": [
    { "id": "wip_enforcement.v1", "fr": "FR-022", "schema": "packages/schemas/..." }
  ]
}
```

### 1.2 Seed data (concrete, from the four plans + current main)

- **From main:** FR-001..021 (core), FR-022 WIP, FR-023 launch-gate, FR-024 decision, FR-025 DoD-cap, FR-026 containment. Policy ids seen in-tree/plans: `wip_enforcement.v1`, `dod_cap.v1`, `re_entry.v1`, `task_map.v1`, and the #235 suggestion/override vocabulary.
- **From daily-driver plan (adopt as FR-027..030 per its renumber):** capture ubiquity, re-entry amnesty, persistence truth, provider canary — each with its HARMONY MATRIX row already written (that matrix IS the seed for `interacts_with`).
- **From task-map plan:** the map feature (number blocked — see C-0A) with `policy_ids: ["task_map.v1"]` and its interaction notes.
- The HARMONY MATRIX axes (S3–S9, C1–C5, moments P0–P7, task-map, NS-INV, UX-INV, perimeter, NFR-001) become the `interacts_with` edges. **Every `X` edge carries a `resolution_ref` — the registry refuses to store an unresolved conflict silently (that is what STOP-and-surface is for).**

### 1.3 Maintenance rule — WHO updates it, WHEN (bound into existing rituals)

- **At contract authoring (stage boundary):** SKILL.md step 4 already pre-drafts "column-level target schema shapes … FR text … pinned module paths." **Add:** "and the coherence-registry entry for every FR this contract introduces, including its `interacts_with` edges against every already-registered FR it touches." The author cannot leave an `X` edge without a resolution — that is the coherence pass (§3).
- **At PR merge (per-slice):** CONTRACT_REVIEW_CHECKLIST gets one new line (§3.2). The reviewer confirms: the slice's FR is registered; any new policy id is in `policies[]`; any new cross-feature interaction the diff creates is reflected as an edge.
- **Shrink/append discipline:** entries are added one-per-FR when the FR is adopted, removed only when the FR is retired. The registry can never grow faster than the feature set — it is a mirror, capped by reality.

### 1.4 Deterministic guards — `apps/web/src/__tests__/coherenceRegistry.test.ts`

Faithful imitation of `docRegistry.test.ts` (parse a JSON snapshot, assert referential integrity, fail CI on drift). **All [implementable] today:**

- **G-FUNC-1 — FR referential integrity.** Every `features[].fr` and every `interacts_with[].fr` matches a unique `### FR-NNN` heading in REQUIREMENTS.md; no two features share an `fr`; no `FR-NNN` heading is duplicated. *(This is the guard that catches C-0A.)*
- **G-FUNC-2 — Policy-id registration.** Every policy-id string literal used in code (grep `packages/schemas` + `apps/web/src/lib` for `"*.v1"` policy ids in the #235 vocabulary) appears in `policies[]`, and every `policy_ids` reference resolves to a `policies[]` id.
- **G-FUNC-3 — Invariant-id validity.** Every id in `invariants[]` exists in ENGINEERING_INVARIANTS.md or an ADR (parse the `INV-`/`NS-INV-`/`UX-INV-` headings).
- **G-FUNC-4 — No unresolved conflict.** Every `interacts_with` edge with `kind:"X"` has a non-empty `resolution_ref`. A conflict without a resolution fails CI — you cannot merge a silently-unresolved contradiction.
- **G-FUNC-5 — Surface freshness (soft).** `surfaces[]` paths that name a file must exist on main (same spirit as the checklist's freshness rule). Warn-not-fail if the path is a logical surface (e.g. "capture") rather than a file.

**Sequencing safety (§5 rule, stated once): each guard must be green on main the day it lands.** G-FUNC-1 in particular will go RED immediately because of C-0A — so its packet is *fix-then-guard*: the FR-number reconciliation lands in the same PR as the guard, or the guard lands disabled-with-`::warning::` (migration-drift shape) until the reconciliation merges. A guard that reddens main blocks the sequential one-slice relay (NS-INV-6) and is itself a coherence failure.

---
## 2. UX-GRAMMAR LAYER — named registries with per-registry enforcement

These are the R3–R9 rows expanded. Each extends a UX_FLOWS / moments / globals.css artifact; each names its enforcement type honestly ([implementable] test vs [gate-only] judgment). The rule for a new feature is always the same shape: **PICK from the registry, or PETITION to extend it** (the petition is a decision-log entry, never a silent local invention).

### (a) Interaction-pattern registry — R3  *[gate-only]*
**Extends:** UX_FLOWS §15 Core UI Components + the moments component contracts (`plan-moments-shell.md` §2). **Consumed by:** contract authors, UI subagents.

Named patterns (seed set — the vocabulary of *how the operator acts*, capped at ~8):

| Pattern | Contract (one line) | Where used today |
|---|---|---|
| **one-pass approve** | whole proposal approved once as a single L1 instance; revisions are fresh L1 proposals | task-map map approve; re-entry recovery move |
| **forced binary** | at a cap/deadline, exactly two forward choices, no silent-continue | FR-025 DoD-cap (cut scope / defer) |
| **refusal-with-swap** | refuse an over-cap action but always offer a swap, never a dead wall | FR-022 WIP at cap; FirstMoveCard "Not this →" |
| **map-peek** | lay-of-the-land node view satisfies map-before-motion in seconds, collapsed-to-next | task-map ProgressionRail |
| **coached toast** | state-change confirmation as a calm, non-shame toast; never a modal | moments onStart/onDone toasts |
| **return ritual** | after absence, a zero-red batch summary + one recovery move | FR-028 re-entry amnesty |

**Enforcement:** [gate-only] — SKILL.md step 4 requires the contract to name which pattern each new interaction uses, OR file a petition (decision-log entry) to add one. CONTRACT_REVIEW_CHECKLIST §D gets a line: "each new interaction maps to a named interaction-pattern (or a logged petition)." A test cannot judge "is this the right pattern" — this is honestly a gate.

### (b) Keyboard-map registry — R4  *[implementable]*
**Extends:** `useMomentKeyboard.ts` §1.3 table (C, ⌘K, 1/2/3, ↵, esc). **Consumed by:** UI subagents.

**Single source file** — the keymap is defined once (e.g. `apps/web/src/lib/keys/keymap.ts` as a `{ key, action, scope, invariant }[]`), and every surface reads from it; no screen hand-binds a key. **Enforcement:** [implementable] **G-UX-2 — keymap collision test** (`keymap.test.ts`): no two entries share the same `key`+`scope`; every entry's `action` is a real registered action; reserved keys (C, ⌘K, esc, ↵, 1/2/3) cannot be rebound to a non-canonical action. A collision fails CI. This is the deterministic core of "a shortcut means one thing everywhere."

### (c) Color/shape semantics — R5  *[implementable]*
**Extends:** globals.css two-axis tokens + prototype-2's documented axes. **Consumed by:** UI subagents. **This is the C-0B reconciliation home.**

The two-axis rule made **binding**:
- **Axis 1 = AREA identity** — one canonical family (recommend keeping main's `--area-accent*`, since it is what ships; prototype `--accent` and any new name are aliases to retire). Retints the whole surface on scope switch. NEVER used to signal state.
- **Axis 2 = STATE** — one canonical, **closed** set of state tokens. Recommend adopting the moments `--state-ok/watch/risk/idle/warn` names as canonical *and mapping them onto the existing `--amb/--blu/--grn` values* (moments §5 already does exactly this: `--state-ok: var(--grn-fg)` etc.), so there is one name and one value. `--st-*` (prototype) is retired. State color is sparse/reserved; area accent never leaks into state meaning.

**Enforcement:** [implementable] **G-UX-3 — token lint** (a rule in `coherenceRegistry.test.ts` or an eslint rule over `apps/web/src/app/components/**`): (1) no raw hex color literal in a component file (must reference a token); (2) no state meaning expressed via `--area-accent*`; (3) only the closed `--state-*` set is used for state. Seeded RED by C-0B → fix-then-guard packet (§5).

### (d) Copy-voice rules — R6  *[gate-only]*
**Extends:** UX_FLOWS §16 Copy Guidelines (direct, non-judgmental; the blessed/banned lists). **Consumed by:** contract authors, UI subagents.

Generalizes §16 into a standing registry: an **append-only** blessed-phrasing list ("This block was missed. What should happen next?") and banned-phrasing list ("You failed…", "You are behind", shame/penalty language, "guardrail" per moments R6). New copy must match voice or petition. **Enforcement:** [gate-only] checklist line ("new user-facing copy conforms to §16 voice; no shame/penalty language; no retired terms like 'guardrail'"). A cheap [implementable] *assist* is possible — a grep guard for a small banned-substring set (e.g. "you failed", "guardrail", "productivity score") — but nuance stays a gate.

### (e) Motion budget — R7  *[implementable]*
**Extends:** moments §5 `--motion-*` (`fast 90ms / base 160ms / slow 240ms`, one ease) + the existing `prefers-reduced-motion` block. **Consumed by:** UI subagents.

Binding rule: **motion confirms a state change only** (never decorative), durations come only from the three `--motion-*` tokens, and every new keyframe/transition is added to the reduced-motion disable block. **Enforcement:** [implementable] **G-UX-4** (CSS lint / test over `globals.css` + component styles): transition/animation durations must reference `--motion-*` (no raw ms literal above a small threshold), and any new `@keyframes` name must appear in the `prefers-reduced-motion` block. Duration-cap and reduced-motion-coverage are both checkable; "is this motion decorative?" stays a light gate line.

### (f) Surface budget per moment — R8  *[gate-only]*
**Extends:** UX-INV-1 (one primary action) generalized + NFR-005 (six primary screens). **Consumed by:** contract authors.

Rule: each moment/surface declares its budget — **exactly one visually-primary action**, a capped element count, no new top-level nav item (NFR-005). This is UX-INV-1 written as a standing budget the contract must state. **Enforcement:** [gate-only] checklist line ("the surface declares its budget: one primary action, no new nav item; over-budget elements are demoted to ghost/disclosure"). UX-INV-1's per-component discharge (moments §UX-INV table) is the concrete pattern.

### (g) Map-view question — R9  *[gate-only, MANDATORY field]*
**Extends:** ADR 0003 moments architecture + the owner's map-first doctrine. **Consumed by:** contract authors.

**Every feature contract MUST answer: "What is this feature's map view?"** — how the feature's state renders in the shared visual grammar (which moment hosts it, which color axis carries its state, what its collapsed/expanded map representation is). A feature with no map-view answer is incoherent-by-omission for a map-first operator. **Enforcement:** [gate-only] mandatory field in the SKILL.md step-4 template + a checklist line ("map-view field is answered, non-empty, and uses only registered color/pattern grammar"). This is the single field that ties the whole framework back to the owner's mental model.

---
## 3. THE COHERENCE PASS — the exact insertions (extends, never invents)

The pass rides three existing surfaces. Nothing here is a new gate; each is a *specialization* of a step that already exists.

### 3.1 Into `lifeos-stage-contract-authoring/SKILL.md` step 4 (contract authoring)
Step 4 already pre-drafts FR text, schema shapes, pinned paths, UX notes. **Append this sub-step, verbatim-ready:**

> **4a. Coherence pass (mandatory for every FR authored).** For each FR in this contract:
> - Add its `coherence-registry.json` entry: `invariants`, `surfaces`, `policy_ids`, and an `interacts_with` edge against **every already-registered feature it touches** (walk the HARMONY MATRIX axes). Any `X` edge MUST carry a `resolution_ref` — if you cannot resolve a conflict, STOP (§3.3), do not author around it.
> - Name each new interaction's **interaction-pattern** (R3) — PICK or file a petition.
> - Answer the **map-view question** (R9): which moment hosts it, which state tokens carry its state, its collapsed/expanded map representation.
> - Confirm new copy conforms to voice (R6) and the surface declares its budget (R8).

### 3.2 Into `CONTRACT_REVIEW_CHECKLIST.md` (PR review — the line Claude's contract reviews add)
Add to section D ("Contract satisfaction"), so it runs on **every** pipeline merge:

> - [ ] **Coherence pass honored.** The slice's FR(s) are registered in `coherence-registry.json` with valid `invariants`/`policy_ids`; any new cross-feature interaction the diff creates is a registered edge; every `X` edge has a `resolution_ref`; new interactions map to a named interaction-pattern (or logged petition); the map-view field is answered; new copy conforms to §16 voice (no retired terms); new UI uses only registered keymap entries and `--state-*`/`--area-accent*` tokens (no raw hex). `coherenceRegistry.test.ts` / `keymap.test.ts` are green.

### 3.3 The STOP-and-surface rule (text — a specialization of checklist §F)
CONTRACT_REVIEW_CHECKLIST §F already says "anything that feels wrong → STOP, comment on the epic, tag @jpatel900." The coherence STOP rule makes one class of "wrong" explicit and non-optional:

> **Coherence STOP-and-surface.** When authoring or review surfaces a contradiction between two features, two artifacts, or a feature and an invariant — an FR-number collision, a token/keyword meaning two things, a policy id used two ways, an interaction pattern that fights another, an invariant an FR would violate — you MUST NOT silently resolve it, author around it, or pick a side to keep moving. STOP. Record it as a `kind:"X"` edge (or an open contradiction note) and surface it: a dated decision-log entry on the governing epic + tag @jpatel900. Resolution is an owner-gated decision that lands in REQUIREMENTS/the registry/the ADR **and all affected sibling artifacts together** (the C-0A lesson: fix propagates atomically, or it re-drifts). Silent resolution is itself a coherence failure.

### 3.4 When the full-corpus coherence audit runs (extends the existing ritual)
The stage-contract-authoring skill already runs at **stage boundaries** (usage-gate opens). **Add one step to that boundary ritual** (SKILL.md step 2 "Boundary review" or a new step): a **full-corpus coherence audit** — regenerate the map (§4), run all coherence guards over the whole registry (not just the diff), and walk the HARMONY MATRIX for any `X` edge whose `resolution_ref` has gone stale (the referenced plan/section changed). This is the only place a full sweep is affordable and it is where new-stage features are about to be authored — exactly when latent drift is cheapest to catch. Per-slice merges do the *incremental* check (§3.2); the boundary does the *whole-corpus* check. No standing cron, no per-session burden.

---

## 4. COHERENCE MAP VIEW — visualizing coherence state itself (cheapest honest option)

The owner is map-first, so coherence state needs a map. **Recommendation: generate a static HTML map FROM `coherence-registry.json`, and surface a one-line health summary in `pnpm status`.** Cheapest honest option, in three tiers (recommend Tier 1 + 2):

- **Tier 1 (must) — extend `pnpm status`.** Add a coherence line: `coherence: N features, M edges, K unresolved-X, guards ok/fail`. This is the text-first honest signal; near-free; reuses an existing command surface. If `K > 0` (unresolved conflicts) or a guard is red, it prints the offending items. This alone satisfies "coherence state is visible without opening anything."
- **Tier 2 (recommend) — generated HTML map from the registry.** A small generator (`scripts/coherence-map.mjs`) reads `coherence-registry.json` and emits a self-contained HTML map: features as nodes, `interacts_with` edges colored C/S/X (X = the `--state-risk` red, using the SAME two-axis grammar the features must use — the map eats its own dogfood), unresolved-X nodes highlighted. It reuses the existing `lifeos-work-map.html` styling already in the scratchpad. **Generated, never hand-edited** — so it cannot drift from the registry (the whole point). Regenerated in the boundary audit (§3.4) and viewable on demand.
- **Tier 3 (defer) — a live in-app coherence surface.** A Health-adjacent screen. Explicitly NOT now — it is a feature that would itself need a coherence entry, and a static generated map is honest and free. Defer until the registry proves valuable.

Rule that keeps the map honest: **the map is a projection of the registry, generated, never a second source.** If the map and the registry disagree, the map is stale — regenerate; never edit the map.

---

## 5. IMPLEMENTATION PACKETS (PR-sized, mostly Sonnet-able docs + guard-test work)

Convention matches the sibling plans: packet = one PR; N=new / E=edit; each independently CI-green; **every guard green on main the day it lands or fix-then-guard in the same PR** (the §1.4 relay-safety rule — a red guard blocks the NS-INV-6 sequential relay). Tier: **sonnet** = contracted docs/guard-test; **opus** = the two reconciliations that carry owner-gated judgment (C-0A, C-0B).

| Packet | Goal | File-touch set | Tier | Green-on-land rule | Sequence |
|---|---|---|---|---|---|
| **CO-0** Registry seed (docs-first) | Create `coherence-registry.json` seeded from main FRs + the four plans' HARMONY MATRIX; add the human matrix section (REQUIREMENTS append or new ADR). No guard yet. | N `docs/coherence-registry.json`; E `docs/REQUIREMENTS.md` (matrix section) or N `docs/adr/0004-coherence-framework.md` | opus (judgment: seed edges + resolution refs) | trivially green (data only) | FIRST. Docs-first per AGENTS.md rule 13. |
| **CO-1** Referential-integrity guard | `coherenceRegistry.test.ts`: G-FUNC-1..5. | N `apps/web/src/__tests__/coherenceRegistry.test.ts` | sonnet (contracted; mirror `docRegistry.test.ts`) | **fix-then-guard: C-0A must be reconciled first (CO-1a) or guard lands warning-skipped.** | after CO-0; needs CO-1a. |
| **CO-1a** C-0A reconciliation | Resolve FR-number collision: adopt daily-driver's renumber (floor FR-027..030, task-map FR-031) into REQUIREMENTS + update the task-map artifact; dated decision-log entry. **Owner-gated (STOP-and-surface outcome).** | E `docs/REQUIREMENTS.md`; E task-map contract; decision-log comment | opus | makes CO-1 green | before/with CO-1. |
| **CO-2** Policy-id guard | G-FUNC-2: every `*.v1` policy id in code is in `policies[]`. | E `coherenceRegistry.test.ts`; E registry `policies[]` | sonnet | seed `policies[]` to match main first | after CO-1. |
| **CO-3** Keymap single-source + guard | Extract keymap to one file; `keymap.test.ts` (G-UX-2 collision). | N `apps/web/src/lib/keys/keymap.ts`; E consumers; N `keymap.test.ts` | sonnet | refactor keeps behavior; E2E stays green | independent; coordinate with moments P1 (`useMomentKeyboard`). |
| **CO-4** Token reconciliation + lint (C-0B) | Pick canonical axes (`--area-accent*` + `--state-*` mapped to `--amb/--blu/--grn`), retire `--st-*`; G-UX-3 no-raw-hex/off-registry lint. | E `globals.css`; E components; N/E lint rule | opus (C-0B is a judgment reconciliation) | **fix-then-guard: retire aliases in same PR as the lint** | after CO-0; coordinate with moments P1 tokens. |
| **CO-5** Motion-budget guard | G-UX-4: durations reference `--motion-*`; new keyframes in reduced-motion block. | E lint/test; E `globals.css` | sonnet | audit existing durations first | after CO-4 (shares globals.css). |
| **CO-6** Ritual insertions | SKILL.md step 4a; CONTRACT_REVIEW_CHECKLIST §D + §F STOP rule; boundary-audit step; map-view template field. | E `SKILL.md`; E `CONTRACT_REVIEW_CHECKLIST.md`; E `TEMPLATES.md` | sonnet | docs-only | any time after CO-0. |
| **CO-7** Map view | `pnpm status` coherence line + `scripts/coherence-map.mjs` generator. | E status script; N `scripts/coherence-map.mjs` | sonnet | generator reads registry | after CO-0. |

**Sequencing vs the floor/relay (nothing blocks them):** all CO packets are docs + test + CI-script files — **file-disjoint from the daily-driver floor packets and the moments P0–P7 packets** except the two coordination points (CO-3 with moments `useMomentKeyboard`, CO-4/CO-5 with moments `globals.css` P1). Land CO-3/CO-4 **before or in lockstep with** moments P1 so the token/keymap canon exists before the moments components consume it — otherwise moments hand-picks names and CO-4 re-does them. CO-0/CO-1/CO-1a are pure docs+test and can run fully concurrent with everything. Recommended order: **CO-0 → CO-1a → CO-1 → CO-2 → CO-6 → CO-7 → (CO-3, CO-4→CO-5 aligned to moments P1).**

---

## 6. RISKS / ANTI-PATTERNS — how this avoids metastasizing into bureaucracy

The owner's options-table lesson (a meta-system that grows faster than the thing it serves is a net negative) applies to THIS system hardest. Guards:

| # | Risk | Hard bound |
|---|---|---|
| B1 | **Registry sprawl** (becomes a dumping ground). | **One entry per SHIPPED FR only.** Draft/future FRs are NOT registered. The registry mirrors reality; it cannot grow faster than the feature set. G-FUNC-1 ties every entry to a real FR heading — orphan entries fail CI. |
| B2 | **Guard proliferation** (a test per worry). | The registry-of-registries table is **capped**: R1–R9, no R10 without an ADR amendment. New coherence rules extend an existing registry or petition; they do not spawn new guard files. Shrink-only spirit: a guard is removed when its feature retires. |
| B3 | **Checklist bloat** (CONTRACT_REVIEW_CHECKLIST grows unreadable). | Exactly **one** new checklist line (§3.2), not one per registry — it references the guards, which do the mechanical work. The checklist stays a rubric, not a manual. |
| B4 | **Over-claiming enforcement** (marking judgment calls as tests). | The [implementable]/[gate-only] labels are binding and mirror the repo's own "NOT yet wired — do not claim it" honesty (INV-6). Only G-FUNC-1..5, G-UX-2/3/4 are tests; the rest are honestly gates. |
| B5 | **The map becomes a second source that drifts.** | The map is **generated, never edited** (§4). Disagreement = stale map = regenerate. Same discipline as any generated artifact. |
| B6 | **A red coherence guard blocks the relay.** | Every guard is green-on-land or fix-then-guard in the same PR (§1.4/§5). A guard that reddens main is itself a coherence failure and is reverted, not merged past. |
| B7 | **STOP-and-surface used to stall progress.** | STOP applies ONLY to genuine contradictions (two things that cannot both be true), never to ordinary design choices. A `C`/`S` edge never triggers STOP; only an unresolved `X` does. The bound is the resolution-ref requirement, not a veto. |

**What NOT to registry (explicit non-goals — the restraint that keeps this honest):**
- Do NOT registry every component, every CSS class, every string. The registries capture *shared grammar that means something* (patterns, keys, the two color axes, voice, motion budget) — not the full UI inventory.
- Do NOT registry draft/speculative FRs, rolling-wave stages beyond the next, or v2 sketches. Reality only.
- Do NOT build a live in-app coherence dashboard now (Tier 3, deferred).
- Do NOT create a new markdown doc where a JSON data file + generated view suffices (avoids the doc-registry surface entirely).
- Do NOT duplicate the HARMONY MATRIX — the JSON is its projection; the matrix is authored once per stage, in one place.

---

## Executive summary (10 lines)

1. **Mechanism, not vigilance:** a standing coherence system (sibling to the doc registry) so alignment stops depending on any session remembering — two equal layers, FUNCTIONAL and UX-GRAMMAR.
2. **Placement argued:** a machine-readable `docs/coherence-registry.json` + `coherenceRegistry.test.ts` + a *generated* human map — a faithful imitation of `doc-registry.json` + `docRegistry.test.ts`; NOT prose-in-REQUIREMENTS (unparseable) and NOT a new narrative markdown doc (rots the doc-registry surface).
3. **It already caught two real drifts:** C-0A an FR-number collision (task-map still calls itself FR-022, now = WIP on main; daily-driver renumbered but the sibling lagged) and C-0B a token triple-naming (`--area-accent`/`--amb-*` vs `--st-*` vs `--state-*` — one two-axis system, three vocabularies). Both surfaced, neither resolved here (STOP-and-surface).
4. **Functional layer (R1/R2):** one entry per shipped FR — invariants, surfaces, policy ids, and HARMONY-MATRIX-seeded interaction edges; every conflict edge REQUIRES a resolution ref. Deterministic guards G-FUNC-1..5 enforce unique/valid FR ids, registered policy ids, valid invariant ids, and no-silent-conflict.
5. **UX-grammar layer (R3–R9):** interaction-pattern registry (PICK or petition), single-source keymap (collision = test failure), the two-axis color rule made binding with a no-raw-hex lint, copy-voice (extends UX_FLOWS §16), motion budget (duration caps + reduced-motion coverage), surface budget (UX-INV-1 generalized), and the **mandatory map-view field** for every feature.
6. **Enforcement honesty:** each guard is labeled [implementable] (a real CI test) or [gate-only] (judgment), mirroring the repo's own "NOT yet wired — do not claim it" discipline. No over-claiming.
7. **The coherence pass extends existing rituals:** one sub-step in SKILL.md step 4, one line in CONTRACT_REVIEW_CHECKLIST §D, the STOP-and-surface rule as a specialization of checklist §F, and a full-corpus audit at stage boundaries (where the sweep is affordable and drift is cheapest to catch). No cron, no per-session load.
8. **Map view:** extend `pnpm status` with a one-line coherence signal (must) + a generated static HTML map from the registry (recommend) that eats its own dogfood by using the same two-axis grammar; live in-app surface deferred. Generated, never edited.
9. **Packets (CO-0..CO-7):** mostly Sonnet docs+guard-test work; two opus reconciliations (C-0A, C-0B); file-disjoint from the floor and moments except two coordination points (keymap ↔ moments P1, tokens ↔ moments P1). Fix-then-guard so no red guard ever blocks the relay.
10. **Anti-bureaucracy is the design's own test:** R1–R9 capped (no R10 without an ADR), one checklist line not nine, registry mirrors reality (shipped FRs only, shrink-only), map generated-not-edited, and an explicit NOT-to-registry list. If this doc sprawls, it has failed its own thesis — so it does not.

