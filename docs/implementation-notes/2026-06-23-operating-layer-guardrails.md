# 2026-06-23 - Operating-layer guardrails

Status: Implemented on `docs/215-217-operating-layer-guardrails`
Why: The remaining open issues were all forward-looking planning constraints for the next project/task operating-layer upgrade. The correct move was to place those guardrails in the authority docs that already own scope, navigation, and data-model rules instead of inventing a parallel planning document.

## Changes

- `docs/REQUIREMENTS.md`
  - Added an operating-layer guardrail section that narrows the next approved planning wave to the project/task/stakeholder/dependency/context operating layer.
  - Anchored all "do not add" logic back to `AGENTS.md` sections 4 and 20 so the guardrail applies existing scope law instead of creating a second drifting non-goals list.
- `docs/UX_FLOWS.md`
  - Added future operating-view containment rules tied to the existing six-screen navigation contract.
  - Explicitly kept project cockpit and similar views subordinate to existing workflow surfaces or secondary detail routes unless product approval says otherwise.
- `docs/DATA_MODEL.md`
  - Added task/project state-taxonomy guardrails: smallest useful state machine, metadata before status explosion, task/project separation, and explicit INV-1 / INV-2 linkage for future stateful schema work.

## Decisions

- No new standalone planning doc was created. The right owners already existed: scope in `REQUIREMENTS.md`, navigation in `UX_FLOWS.md`, and state taxonomy in `DATA_MODEL.md`.
- The operating-layer guardrail intentionally does not duplicate the whole V1 non-goals list. It points back to `AGENTS.md`, which remains the higher-authority canonical list.
- The data-model guardrail is planning-only; it does not change current schema, parser contracts, or UI behavior.

## Validation

- `git diff --check`
- manual doc review of the affected sections
- `pnpm format:check` remains noisy repo-wide and is not a reliable patch-only signal in the current checkout

## Risks and limitations

- These sections constrain future work but do not mechanically enforce behavior; an agent can still ignore them if it ignores the authority chain.
- Provider degradation surfacing in Health remains open runtime work; this change only documents adjacent future constraints.

## Rollback

- Revert the authority-doc additions in this branch. No runtime code, workflows, migrations, or tests changed.
