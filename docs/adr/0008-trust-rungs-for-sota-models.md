# ADR-0008: Widen agent trust rungs for current-generation models

**Date:** 2026-08-04 | **Status:** PROPOSED — nothing in this ADR takes effect until the owner ratifies it. Written as part of the 2026-08-04 docs modernization (owner asked for a concrete proposal, ratified separately).

**Context:** The repo's automation tiers and self-approval rules were calibrated in May-July 2026 against earlier-generation models. Since then the guard surface has grown substantially: risk classifier, path allowlists with shrink-only policies, doc-registry and coherence guards, public-evidence hygiene, migration drift detection, provider canary, Main Red Guard auto-revert, and the safe-automerge demotion path — all CI-enforced. INV-10 (autonomy graduation gate) defines the checklist any expansion must clear. Meanwhile every trust expansion is spending owner attention on merges the guards already police.

**Decision (proposed rung moves, each independently ratifiable):**

1. **Widen T0 to guard-policed mechanical classes.** Add to the safe-automerge allowlist: `docs/program/**` (program-state updates — the freshness this repo keeps losing) and test-only PRs that strictly ADD assertions (no deletions/weakenings — the risk classifier already detects assertion changes). Gate: INV-10 checklist filled per class, including pre-registered decision-data criteria (the item the docs-only lane skipped).
2. **Agent-merge of own low-risk green PRs with a review window.** Replace the blanket self-approval block for `risk:low` non-T2+ PRs with: auto-merge arms only after a 24-hour open window with the owner notified, and the Main Red Guard demotion applies to this class automatically on any red-main incident it causes. Owner can revert to blanket-block by removing one allowlist entry.
3. **Standing authorization for repo-state reconciliation.** Doc fixes that make a doc match verified repo reality (the class this cleanup program is) get a standing owner-ratified umbrella issue, so each instance needs a PR but not a fresh ratification.
4. **Session-length gates replace per-step gates.** For work inside an owner-ratified program (e.g. the Final UX Loop), agents proceed through multi-slice sessions without per-slice check-ins; the gates are the program's own re-score/pin rules plus the OWNER-GATE marker rubric. This codifies what already works in practice.

**Explicit non-moves (binding regardless of model capability):** external calendar writes, any outbound communication, RLS/migrations/schema changes, secrets and production env, data deletion, and spending money all stay human-gated. No irreversible/external class ever auto-executes (ADR 0002 D1's "never" rung is untouched).

**Rationale:** Trust should attach to the guard surface, not the model vintage. Every proposed move is (a) reversible by one allowlist edit, (b) auto-demoting on incident via the existing Main Red Guard path, and (c) INV-10-gated. The cost of NOT moving is real: owner-merge queues delay the program the owner declared terminal, and stale-by-waiting docs regress the truth-store this week's cleanup established.

**Alternatives rejected:** Blanket "trust the model more" without per-class gates — rejected; INV-10 exists precisely to prevent vibes-based graduation. Keeping everything owner-merged — rejected as the status quo this ADR examines; it spends the scarcest resource (owner attention) on the classes guards already police. Model-conditional rules ("if the model is X, allow Y") — rejected; capability-neutral per-class gates age better (see `docs/agent/MODEL_LANES.md`).

**Consequences:** If ratified per-class: each class files its INV-10 checklist in its enabling PR; `scripts/agent/automation-policy.mjs` and `.github/AGENT_AUTOMATION_POLICY.md` change in the same PR (T2, owner-merged); decision data (merge outcomes, incidents) is collected from day one so graduation and demotion stay evidence-based.

**Reversal trigger:** Any red-main incident or hollow-green event attributable to a widened class demotes that class automatically (existing demotion tooling); two incidents in 30 days for the same class revert the class's rung permanently pending a fresh INV-10 run.
