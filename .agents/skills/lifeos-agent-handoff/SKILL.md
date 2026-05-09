---
name: lifeos-agent-handoff
description: Use near the end of substantial LifeOS work to enforce proof-based handoff quality, docs updates, validation evidence, risks, and rollback notes.
---

# lifeos-agent-handoff

## Use when

- Near the end of implementation, bugfix, audit, or doc change work.
- Preparing the final response.

## Do not use when

- You are still in early exploration or active editing with no verification yet.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Do not claim completion without proof.
- Do not hide validation gaps, risk, or rollback implications.

## Procedure

1. After major updates, update `docs/PROJECT_STATE.md` with concise factual status.
2. Do not claim done without proof.
3. Include in final handoff:
   - files changed
   - tests run
   - validation results
   - limitations
   - risks
   - rollback plan
   - docs updated status
4. If validation was skipped or blocked, state exact command and reason.

## Done criteria

- `docs/PROJECT_STATE.md` is updated after major changes.
- Final handoff includes proof, validation results, limitations, risks, rollback plan, and docs status.
- Any skipped or failed validation is reported exactly.
