# Model-degradation runbook

What changes when the strongest available model tier drops (e.g., Fable-class unavailable; best executors are Opus-4.8-class and GPT-5.5-class). Principle: **capability lives in the artifacts; trust lives in the gates.** When executor capability drops, the artifacts stay constant and the gates tighten. Nothing about the destination changes — only the width of the checkpoints.

## Tier roles

| Role                                  | Frontier available                             | Degraded (Opus-4.8 / GPT-5.5 class)                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage contract authoring (S0 content) | One model authors from SKILL.md + STAGE_BRIEFS | Author from TEMPLATES.md skeletons + STAGE_BRIEFS; **cross-model review mandatory** (one model authors, a different-vendor model red-teams against the brief + checklist); **owner review gate reactivates** on the S0 PR |
| Slice implementation                  | Codex-class via relay (unchanged)              | Unchanged — slices are already written to be executed mechanically                                                                                                                                                        |
| Merge review                          | Driver per CONTRACT_REVIEW_CHECKLIST           | Same checklist, plus: any checklist item the reviewer marks "uncertain" = FAIL-and-escalate (uncertainty never merges)                                                                                                    |
| Judgment escalation                   | Rare                                           | Owner becomes the tie-breaker for every STOP; expect more STOPs — that is the system working, not failing                                                                                                                 |

## Gates that reactivate or tighten under degradation

1. **S0 owner review returns.** The Claude-fidelity-review downgrade (epic #251 decision log, 2026-07-02) was justified by frontier-authored appendix content. Degraded-tier S0 authorship = owner reviews the contract PR again.
2. **Cross-model red-team on contracts.** Before an S0 issue is filed, a second model from a different vendor reviews the draft against STAGE_BRIEFS.md hard constraints + TEMPLATES.md rules, hunting for: invented paths, un-numbered thresholds, schema shapes that repurpose existing columns, brief violations. Findings are resolved or escalated before filing.
3. **Deterministic verification becomes a prerequisite, not a nice-to-have.** Before any degraded-tier stage begins: hardening issue #287 (golden-capture eval harness) MUST be implemented, and the stage's golden-journey spec written into CI by its final slice as usual. Machine-checked correctness compensates for weaker in-flight judgment.
4. **Slice size shrinks.** If two consecutive slices bounce off the merge checklist (fix-cycles > 2 per slice), split remaining slices — smaller contracts, more gates. The relay tolerates more, smaller slices better than judgment-heavy big ones.
5. **No doctrine authoring.** Degraded-tier sessions do not amend ADRs, invariants, or this skill pack beyond typo-level fixes. Doctrine changes wait for owner + the strongest available model, or the owner alone.

## If Codex (implementation lane) is also unavailable

The relay's @codex mention lane is replaceable: any competent coding agent can implement a slice, because the binding contract is the issue body, not the agent. Substitute lane: owner or driver assigns the kicked issue to the available agent (Claude Code session, alternative cloud agent) with the same standing-rules text the kick template carries. The merge checklist does not change.

## What never degrades

- The invariants (NS-INV-1..9), the trust ladder (ADR 0002 D1), approval gates, and the "never" row (irreversible actions capped at L2).
- The relay's sequential discipline (NS-INV-6).
- The rule that uncertainty escalates instead of merging.

## Recovery

When frontier capability returns: owner may re-delegate the S0 review gate (dated epic decision-log entry), retire the cross-model red-team requirement, and resume normal cadence. Artifacts need no changes — that is the point of this pack.
