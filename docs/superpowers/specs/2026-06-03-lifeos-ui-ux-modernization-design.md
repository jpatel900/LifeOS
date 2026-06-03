# LifeOS UI/UX Modernization Design

Date: 2026-06-03
Status: Draft for review
Scope: Visual and UX modernization of the existing LifeOS web app without feature expansion

## Purpose

LifeOS currently has strong truthfulness and workflow-safety guardrails, but the product feel still leans too far toward cautious internal tooling. This pass should make the system feel like a modern product that is aesthetically pleasing, easier to enter, easier to trust, and more satisfying to use repeatedly.

The goal is not a cosmetic skin. The goal is to reduce cognitive load, reduce micro-decisions, improve time-to-flow, and make the core workflow feel more desirable without weakening any LifeOS safety or truthfulness boundaries.

## Source weighting

When sources disagree, use this order:

1. `AGENTS.md`
2. Authority docs such as `REQUIREMENTS.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, and `TEST_PLAN.md`
3. Newer shipped-state evidence in `docs/PROJECT_STATE.md` and implementation notes
4. Enforced test contracts, especially UX truthfulness and source-of-truth tests

Bias toward the newer shipped direction when all of the following are true:

1. It is clearly intentional.
2. It is already protected by tests or repeated shipped-state notes.
3. It preserves truthfulness, safety, and product invariants.
4. Reverting it would materially worsen the product.

## Core doctrine

- LifeOS remains a workflow cockpit, not a dashboard and not a command center.
- Home remains read-only.
- External calendar writes remain explicit, approval-gated, and visibly truthful.
- Save-state truth remains explicit, especially `Saved to account` versus `Saved on this device only`.
- The app should feel calm, beautiful, and opinionated at rest, then visually intensify around the current next action.
- Progressive disclosure should do most of the work for reducing clutter.
- The interface should preserve executive function for the work itself rather than spending it on interpretation.

## Product principles

These principles should govern the redesign more than any individual aesthetic reference:

- Invisible architecture: the next useful action should be obvious before much reading happens.
- Opinionated defaults: the system should make most non-essential choices for the user through ordering, emphasis, and defaults.
- Spatial constancy: important elements should stay in stable positions and transition in place rather than teleporting.
- Micro-closure: actions should produce small satisfying closure signals so the product feels responsive and rewarding.
- System 1 first: hierarchy, grouping, color weight, and motion should guide attention pre-attentively.
- Time-to-flow: the user should move from opening the app to being oriented and ready to act in a few seconds.

## Non-goals

- No feature expansion
- No route renaming as the default move
- No navigation model rewrite
- No turning Home into a mutation surface
- No weakening of save-state truth or Google approval boundaries
- No decorative motion that adds noise without meaning
- No vague or misleading simplification that hides operational truth

## Visual direction

The target direction is a hybrid:

- The composure, restraint, spacing discipline, and premium editorial feel should lean closer to the calmer end of modern product design.
- The energy model should come from the more alive product-tool end: the current mission or next move should feel visibly elevated and easier to commit to.

Practical translation:

- Dark-first shell with atmospheric depth and cleaner framing
- Stronger hierarchy jumps between headline state, active workflow content, and support context
- Fewer equal-weight cards
- Richer but controlled contrast
- Cleaner page composition and more breathable spacing
- Moderate motion only where it preserves orientation or reinforces action

## Information architecture and disclosure model

- Every primary screen should have one dominant state or action block.
- Secondary content should be grouped into smaller, quieter support zones.
- Technical or implementation-heavy wording should move into one consistent `System details` disclosure pattern per screen.
- Human truth remains inline. Example categories include save mode, approval boundaries, and disabled reasons.
- The product should remove micro-decisions by shrinking visible choice sets until a deeper choice is actually needed.

## Screen strategy

### Home

- Remains read-only.
- Becomes the strongest expression of the product.
- Must provide immediate orientation, current-area presence, one dominant next move, and a small number of secondary paths.
- Should avoid a wall of equal-weight cards.
- Secondary context should appear quieter and only when useful.

### Execute

- Becomes the flagship focus surface.
- Should minimize time-to-flow more aggressively than any other route.
- The current mission should feel physically central and visually alive.
- Valid controls should remain stable and easy to hit.
- Terminal or recovery states should still feel composed and non-shaming.

### Capture

- Should feel nearly frictionless.
- The writing surface should dominate.
- Area, save truth, and organize outcomes remain present but should stop visually competing with the act of capture.

### Triage

- Should feel like a current-item queue, not a backlog console.
- One current item should dominate.
- Up-next context should remain visible but quieter.
- Accept, edit, and reject paths should feel fast and opinionated.

### Planning

- Should feel like guided scheduling rather than proposal administration.
- Suggested time, planned blocks, conflict-check state, and Google actions should be visibly grouped by intent.
- Local-first planning should feel complete and worthwhile in its own right.

### Review

- Should feel reflective and resolved, not analytics-first.
- Closure-oriented groupings should lead.
- Summaries and saved history should remain available but secondary.

### Health

- Should continue leading with a top-level answer to whether the user can rely on the system today.
- Diagnostics remain available, but visually demoted.
- Optional-disabled states should stay informative rather than alarmist.

### Areas and other secondary/admin surfaces

- Should look cleaner and more premium.
- Should remain truthful without feeling like old settings software.

## Contradiction-resolution rules

- If an older authority doc conflicts with a clearly newer shipped and tested UX pattern, update the docs rather than reverting a better product decision by default.
- If a current runtime pattern looks nicer but weakens truthfulness, revert the runtime pattern instead.
- If the repo has ambiguity rather than true contradiction, choose the simpler and more opinionated path that best reduces micro-decisions while preserving LifeOS safety rules.

## Implementation strategy

This should be executed as an anchor-led product pass, skewed slightly toward a broader modernization pass.

Phase shape:

1. Foundation layer
   - shared shell hierarchy
   - typography refinements
   - surface tiers
   - consistent disclosure treatment
   - motion and spacing system
2. Flagship anchor pass
   - Home
   - Execute
3. Full baseline screen pass
   - Capture
   - Triage
   - Planning
   - Review
   - Health
   - Areas and secondary admin surfaces
4. Doctrine reconciliation
   - update lagging docs where runtime direction is clearly intentional and protected
5. Proof and refinement
   - test updates
   - browser validation
   - factual project-state update

## UX behavior rules for implementation

- Primary controls should stay stable in location across adjacent states where practical.
- State changes should favor in-place transitions over disappearing and reappearing elsewhere.
- Empty states should prescribe the next meaningful step instead of merely reporting absence.
- Confirmations should read as closure plus next move, not generic success banners.
- Supporting context should collapse or quiet itself until it becomes relevant.
- Visual hierarchy should carry more meaning so the user reads less.

## Testing and validation

Required validation for this pass should include:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`

Plus targeted UX proof:

- update `sourceOfTruth.test.ts` only where current truthfulness or disclosure contracts intentionally change
- preserve or extend focused route tests for Home, Execute, Planning, and other touched screens
- run browser-level verification after the UI pass because this work is about feel, hierarchy, and flow, not only static correctness

## Risks and guardrails

Primary risks:

- pretty but vague UI
- hidden truth boundaries
- stronger aesthetics without stronger hierarchy
- flagship screens improving while the rest of the app still feels stale
- broad churn that accidentally reopens doctrine drift

Guardrails:

- keep Home read-only
- keep approval-gated Google writes explicit
- keep save-state truth inline
- keep technical details available through structured disclosure, not deleted
- avoid route renames unless authority docs are updated first
- preserve mock/local fallback behavior and existing persistence semantics

## Acceptance criteria

- The app feels materially more premium and visually pleasing, not merely recolored.
- The dominant next action is clearer on every primary screen.
- Home and Execute stand out as flagship experiences.
- The rest of the primary screens receive enough modernization that the product feels coherent end-to-end.
- Truthfulness messaging remains explicit but less visually noisy.
- Technical wording is consolidated into quieter disclosures where appropriate.
- Contradictions between older docs and clearly newer enforced UX are resolved in the safer direction.
- No feature scope is expanded.
- Required validation passes.

## Recommended next step

Write the implementation plan around the anchor-led product pass:

1. shared visual system and shell hierarchy
2. Home redesign
3. Execute redesign
4. baseline modernization across remaining screens
5. doctrine/test/doc reconciliation
