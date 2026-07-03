# End-to-end slice map — north star, complete path

**NON-BINDING planning map (rolling-wave compliant).** Slices for FUTURE stages exist here as names + one-line intents + authoring packets ONLY. They become implementable issues exclusively through the stage-boundary ritual (SKILL.md), authored against current main at that time, within STAGE_BRIEFS.md constraints. Filing a future-stage slice issue directly from this map is a wrong-path (see tracker #293). Expect slice names/counts below to change at contract time; that is intended, not drift.

Status legend: FILED = live GitHub issue. NAMED = exists only here.

## Wave 0 — Pre-Stage-1 (epic #243) — FILED, in flight
| ID | Slice | Status |
| --- | --- | --- |
| B5 #237 | All-day conflict semantics | FILED (in flight) |
| B7 #238 | AI/env capture end-to-end | FILED |
| B6 #239 | Cockpit Google approval bridge | FILED |
| B3 #240 | Calendar update/cancel (OWNER spike gate) | FILED |
| B8 #241 | Production smoke golden journeys | FILED |
| — #236 | B4 done via PR #279; needs one-click close | FILED |

## Wave 1 — Stage 1: Chief-of-staff nouns (epic #251) — FILED, queued behind cutover
S0 #252 contract · S1 #253 people/commitments schema · S2 #254 context choke point + charters + operator profile · S3 #255 commitment/person extraction · S4 #256 waiting-on aging · S5 #257 calendar-load daily focus · S6 #258 daily brief · S7 #259 wins log · S8 #260 rollups · S9 #261 learning consumer + golden journey.

## Wave H — Cross-cutting hardening (non-pipeline, slack-time) — FILED
#286 security scanning CI · #287 AI-parsing eval harness (**prerequisite for any degraded-tier stage — see MODEL_DEGRADATION_RUNBOOK.md**) · #288 LLM call tracing · #289 quarterly distillation · #297 watchdog closing-keyword check (T2).

## Wave 2 — Stage 2: Memory & knowledge — NAMED (authored at 1→2 boundary)
| ID | Slice intent |
| --- | --- |
| 2.S0 | Contract slice: FR text + full stage schema shapes (REQUIREMENTS/DATA_MODEL/INVARIANTS/UX_FLOWS) |
| 2.INV | Notion deep-pass inventory: open-item counts per Tasks DB, identity-content extraction, bucket proposals. READ-ONLY; may run PRE-gate as input work |
| 2.S1 | reference_records schema + RLS + export (knowledge-action link tables) |
| 2.S2 | Migration executor: bucket-classification proposals + approval-gated batch import of action truth |
| 2.S3 | Identity import: Area Charter / Operator Profile drafts from Notion identity bucket (user-edited before save) |
| 2.S4 | Knowledge-action links in UI + context-assembly extension (NS-INV-1) |
| 2.S5 | Ask-your-cockpit v1: read-only SQL synthesis with query shown |
| 2.S6 | Playbook detection v1: rule-based recurring-pattern surfacing, F-rubric proposals |
| 2.S7 | Stage-2 golden journey + smoke extension; closes epic |

## Wave 3 — Stage 3: Perimeter senses & hands — NAMED (authored at 2→3 boundary)
| ID | Slice intent |
| --- | --- |
| 3.S0 | Contract slice |
| 3.S1 | Perimeter ingress contract: dedicated scoped credential, rate-limited capture-only endpoint, hostile-input assumptions |
| 3.S2 | First perimeter channel adapter (Hermes-class gateway on separate host; one-way POST; zero tokens) |
| 3.S3 | Containment proof: prompt-injection golden set demonstrating capture-item-only blast radius |
| 3.S4 | Consent-based meeting capture: per-session consent artifact -> transcript -> untrusted capture pipeline |
| 3.S5 | Draft-for-approval external messages: proposal schema + recipient/channel allowlist |
| 3.S6 | Send-approval flow + audit (generalizes calendar gate; trust ladder L1) |
| 3.S7 | Stage-3 golden journey + smoke (must include the injection scenario); closes epic |

## Wave 4 — Stage 4: Earned autonomy — NAMED (authored at 3→4 boundary)
| ID | Slice intent |
| --- | --- |
| 4.S0 | Contract slice |
| 4.S1 | Action-class registry: schema, rungs, graduation/demotion history; irreversible classes structurally capped at L2 |
| 4.S2 | Evidence engine: SQL eligibility computation + owner countersign flow (thresholds per STAGE_BRIEFS) |
| 4.S3 | L3 executor: auto-execute with one-tap undo + audit + digest entry (reversible classes only) |
| 4.S4 | Auto-demotion mechanics: any override/undo -> L2, logged, evidence window restarts |
| 4.S5 | Autonomy digest surface (daily "what ran autonomously" panel) |
| 4.S6 | Stage-4 golden journey: graduation -> execution -> undo -> auto-demotion cycle; closes epic |

## Boundary sessions (not slices — rituals per SKILL.md)
R1: 1→2 boundary (gate evidence -> author Wave 2 contract + epic + slices, file Stage 3 card). R2: 2→3. R3: 3→4. Each runs steps 1–7 of SKILL.md; under degraded model capability apply MODEL_DEGRADATION_RUNBOOK.md.

## Work packets for delegated (Opus-class) sessions

Every packet below is self-contained for a cold session. Universal rules: read AGENTS.md + this skill directory first; work in an isolated worktree, never the shared checkout; numbers/paths from current main, never from memory; missing information = STOP and comment on the governing issue, never invent; do NOT file future-stage slice issues.

**Packet P1 — Notion deep pass (2.INV). Runnable NOW.** Read stage card #292. Using the Notion connector (read-only), enumerate every Tasks-like database, count open vs stale items, extract identity-bucket candidate text (goals/missions/principles), propose four-bucket assignments per STAGE_BRIEFS Stage-2 decision rules. Deliverable: a report comment on #292. No writes to Notion, no imports.

**Packet P2 — Hardening issues #286, #287, #288 (one session each). Runnable NOW.** Each issue body is the binding contract. #287 first (it is the degradation prerequisite). Standard delivery: worktree branch -> PR citing the issue -> CI green -> review per CONTRACT_REVIEW_CHECKLIST.md sections A–D. #286/#297 touch workflows = T2, owner review on the PR.

**Packet P3 — Stage boundary ritual (R1/R2/R3). Runnable ONLY when the gate opens.** Follow SKILL.md steps 1–7 exactly: gate evidence -> next-phase-gate-review -> harvest -> author contract via TEMPLATES.md within STAGE_BRIEFS.md constraints -> file epic + slices -> rewire driver + tracker + next stage card -> log. Under degraded capability: cross-model red-team the contract, reactivate S0 owner review, confirm #287 is implemented before starting.

**Packet P4 — Slice implementation. Continuous.** Normally Codex via the relay kick; any competent coding agent may substitute (MODEL_DEGRADATION_RUNBOOK.md "If Codex unavailable"): implement exactly the kicked issue body, smallest change, PR with closing keyword, then the driver reviews per checklist.

## Rot warning
This map was written 2026-07-03 against epic #243 in flight and Stage 1 filed. The FILED waves are authoritative in their issues, not here. The NAMED waves are intents; reconcile against ADR 0002 + STAGE_BRIEFS at each boundary. If this file contradicts a live epic or the ADR, the live artifact wins — update this map, never the other way around.
