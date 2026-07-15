# ADR-0005: Evolve from V1 with capability-specific gates

**Date:** 2026-07-15 | **Status:** accepted

**Context:** V1 is now a shipped, useful baseline. ADR 0002 D3 made real usage of every prior stage a blanket prerequisite for starting any later-stage work. That rule protected against building a hobby instead of a useful system, but it also blocked data-independent foundations whose correctness and value do not depend on personal usage evidence. The vision corpus remains important strategic input, while requirements and ADRs remain implementation authority.

**Decision:** Treat stage labels as dependency and risk order, permit owner-ratified data-independent foundations when all invariants are preserved, and require relevant usage evidence before capabilities whose effectiveness or permission depends on personal behavior.

The evidence-dependent classes are:

- personalization conclusions;
- initiative or autonomy graduation;
- proactive interruption;
- external channels or writes; and
- data-derived policy changes.

Every implementation slice still requires acceptance criteria, a bounded issue and touch manifest, requirements authority, and the normal review for risky surfaces. Permanent non-goals and all safety, privacy, RLS, transaction, raw-capture, strict-schema, and calendar-approval invariants remain binding. Vision documents may propose and challenge direction, but authorize implementation only after their relevant ideas enter reviewed requirements or an ADR.

**Rationale:** Gate a capability on the evidence it actually needs. This preserves the trust logic that prevents premature personalization or autonomy without turning an unrelated lack of usage data into a moratorium on deterministic, reversible foundations.

**Alternatives rejected:** Keep the blanket stage gate — rejected because it conflates dependency with calendar order and blocks foundations that need no behavioral evidence. Remove stage and usage gates entirely — rejected because personalization, interruption, autonomy, policy learning, and external action are unsafe or ineffective without evidence. Make the vision corpus direct implementation authority — rejected because strategic exploration must be reconciled through review before it can change product contracts.

**Consequences:** Parallel work is possible across non-overlapping, owner-ratified foundations, while evidence-dependent behavior may still idle until its own gate is met. Reviewers must classify the capability and name its actual dependency instead of relying on a stage number alone. The ADR 0002 D3 blanket usage-gate sentence and its negative consequence are superseded; ADR 0002's trust ladder, spine/perimeter model, dependency ordering, and NS-INV-1 through NS-INV-9 remain in force.

**Reversal trigger:** Revisit this decision if independent foundations repeatedly create unused product weight despite issue-level ratification, or if capability classification proves too ambiguous to enforce consistently. Any reversal must preserve per-action trust evidence and permanent safety boundaries.
