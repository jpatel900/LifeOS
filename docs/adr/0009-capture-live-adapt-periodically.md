# ADR 0009 — Capture live, adapt periodically: the learning layer moves out of the app

- **Status:** Proposed (owner ratifies by merging this PR)
- **Date:** 2026-08-23
- **Deciders:** jpatel900 (owner), orchestrator session 2026-08-23
- **Amends:** ADR 0005 (staged evolution — the "system learns in place" assumption); extends ADR 0002 (trust ladder) and the zero-target rule (harmony rule, owner 2026-08-10)

## Context, in plain words

LifeOS was designed with a built-in learning layer: the app records how it gets used, adapts its own behaviour from that data, and changes what it suggests. The machinery is real, tested, and guarded — and it has never done anything. Measured against production on 2026-08-05: seven suggestion records, five override records, **zero duration-profile rows ever written**, and the AI context assembly reads none of it. The verdict then was "dormant by underuse, not theater," and the bottleneck named was daily usage, not code.

Meanwhile the layer has a standing cost even while idle: every campaign slice must respect its invariants (area-scoped learning, sanctuary fail-closed, journal coverage), its code paths must stay tested and typed, and its adaptive branches are exactly the hard-to-verify shape that produced this repo's hollow-green incidents elsewhere. The upcoming kernel wave (six merged kernels awaiting surfaces) would grow this layer substantially.

The owner's observation (2026-08-23): a layer that adapts in place, while the thing it adapts to barely runs, may itself be a reason everything takes long. Proposal: keep collecting the data, but do the analysis and the changes periodically, outside the app.

## Decision

**The app captures; it does not adapt. Adaptation becomes a periodic, owner-reviewed batch. Parked code goes to the attic, not the bin.**

1. **Capture stays live and dumb.** `suggestion_records`, `override_records`, `ai_call_traces`, and their write paths stay exactly as they are. Cheap, already built, and the raw material for everything below. No schema changes.
2. **Adaptation moves to a periodic batch, run by the agent layer.** A recurring analysis (riding the existing daily pipeline driver and the monthly consolidation pass — no new scheduler, per the harmony rule) reads the captured data and proposes changes **as ordinary pull requests**: evidence in the body, a reviewable diff, owner approval before anything changes. This fits the trust ladder better than in-app learning — adaptations arrive as proposals with provenance, never as silent drift.
3. **The app reads tuned constants, not live-learned state.** When analysis concludes something ("deep-work blocks really take 90 minutes"), it lands as a plain configuration value in a PR. Same personalised experience; none of the adaptive code paths.
4. **The boundary: reacting is product, tuning is learning.** Features that must respond within a session — triggers firing (FR-048), the quiet minimal face after absence (FR-037), closure ceremonies (FR-035) — remain in-app and **rule-based**, reading fixed thresholds. Only the machinery that _changes those rules from usage data_ moves to the batch.
5. **Parked code goes to the attic (owner decision 2026-08-23: keep, don't delete).** Before removal from main, each parked path gets a permanent annotated tag (`attic/<name>-v1`) and a row in a new `docs/ATTIC.md` catalog: what it did, where the tag is, which tests proved it, and the explicit condition for bringing it back. Resurrection is one documented command, not archaeology. Commented-out code is expressly rejected — it rots, fights the dead-code sweep, and hides from the type checker.

## What happens to each component

| Component                                                                                                                                                    | Disposition                                                                                         | Resurrection condition (goes in ATTIC.md)                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `suggestion_records` / `override_records` / `ai_call_traces` tables + write paths                                                                            | **Keep live** (capture)                                                                             | n/a                                                                                                                          |
| `lib/learning/durationRecalibration.ts` (the only behaviour-changing path; never fired)                                                                      | **Attic**                                                                                           | duration data shows ≥50 real completed sessions AND the periodic batch proves its constants beat the tuned-constant approach |
| `lib/learning/overrideScan.ts` + `learningSurface.ts`                                                                                                        | **Attic** (their analysis job moves to the periodic batch)                                          | the batch's own analysis outgrows PR-sized proposals                                                                         |
| `duration_profiles` table                                                                                                                                    | **Keep (empty)** — schema removal is a migration; not worth one for an empty table                  | n/a                                                                                                                          |
| Six kernels (`initiativePolicy`, `graduationEligibility`, `sanctuary`, `closurePolicy`, `rupturePolicy`/`ruptureSignals`, `triggerMatching`, mirror kernels) | **Keep as-is** — pure, tested, inert modules that interfere with nothing; already well-parked       | n/a (kernel wave decides their surfaces)                                                                                     |
| `graduationEligibility`'s auto-graduation arm                                                                                                                | **Flag-off within the kernel wave** — graduation proposals become batch output like everything else | ≥20 real initiative opportunities recorded (FR-032's own bar)                                                                |
| Learning invariants in AGENTS.md / coherence registry that bind every slice                                                                                  | **Rewrite in the implementation slice** to bind the batch instead of the app                        | n/a                                                                                                                          |

Consumers to re-point (mapped 2026-08-23): `PlanView.tsx` / `ReviewView.tsx` (rollback-flag-only surfaces) and `taskmap/revision.ts` / `taskmap/timeline.ts`. The implementing lane must re-verify this consumer list against main before cutting.

## Consequences

- The kernel wave shrinks: Track C (usage-gated graduation machinery) collapses into the batch design; Tracks A/B lose their learning hooks and keep their rule-based surfaces.
- A whole class of future verification burden (adaptive branches, learning-path guards) stops growing.
- Personalisation latency drops from "instant, in theory, never in practice" to "next batch run" — with current usage volume this costs nothing; if daily usage arrives and batch latency genuinely hurts, that is precisely the resurrection condition written into the attic.
- One new obligation: the periodic batch must be a real mechanism with a second-fire proof (this repo's own rule for automation), not a standing intention.

## Alternatives rejected

- **Delete outright** — rejected by the owner; the work may serve later and git history alone is poor rediscovery.
- **Comment out / leave flag-off in place** — rots, fights knip and the formatter, and keeps charging maintenance on every refactor.
- **Status quo (live but dormant)** — the current tax: every slice pays the layer's invariants while it does nothing.

## Implementation note

This ADR is docs-only and respects the feature freeze. The implementation slice (attic tags + ATTIC.md + consumer re-pointing + invariant rewrite + the batch's first real run) is contracted separately after ratification, and is itself subject to the C2-first sequencing law.
