---
name: lifeos-agent-handoff
description: Use near the end of substantial LifeOS work to write a proof-based handoff: what shipped, commands and results, UNVERIFIED list, and rollback.
---

# lifeos-agent-handoff

## Use when

- Near the end of implementation, bugfix, audit, or doc change work.
- Writing the final report.

Skip it during early exploration.

## Authority

`AGENTS.md`, project authority docs, and direct user instructions override this skill.

## Report

Four parts:

1. **What shipped**, in plain words.
2. **Commands run and their results.** Per `AGENTS.md` rule 11, each "it works"
   claim carries the exact command and observed output. If a check was skipped or
   blocked, give the command and the reason.
3. **UNVERIFIED list**, each item with the command that would prove it.
   UNVERIFIED means not proven, not not done.
4. **Rollback**, how to undo it.

Update `docs/PROJECT_STATE.md` only when shipped behavior, status, or governance
materially changed. Replace, don't append (`AGENTS.md` rule 6).

Follow-ups go in as unchecked `AGENT-TODO:` or `OWNER-GATE:` checkboxes (OWNER-GATE
only for the rule 11 rubric). No free-text "the owner should…". A follow-up does
not authorize itself; a fix needs its own claimed task.
