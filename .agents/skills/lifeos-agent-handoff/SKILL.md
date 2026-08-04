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
- Do not silently drop a credible observation because it is outside the approved scope.
- Do not fix, file, or expand scope around that observation without a separate claimed task.

## Procedure

1. Update `docs/PROJECT_STATE.md` only when shipped behavior, status, or governance
   guidance materially changed — replace, don't append (AGENTS.md rule 6). When you
   do, also triage the oldest undecided `docs/KNOWN_ISSUES.md` row: fix, schedule,
   or accept with a reason.
2. Do not claim done without proof. Per AGENTS.md rule 11, a claim that something
   works carries the exact command run and the observed output; "should work" is
   banned. Everything not verified goes in an explicit UNVERIFIED list with the
   test that would verify it — UNVERIFIED means _not proven_, not _not done_.
3. Include in final handoff:
   - files changed
   - tests run (exact commands and observed output)
   - validation results
   - UNVERIFIED list (rule 11)
   - limitations
   - risks
   - rollback plan
   - docs updated status
4. Include an `Observed outside scope` section. Write `None.` when no credible
   observation remains. For each remaining observation:
   - label the directly observable source as `EVIDENCE`
   - label a falsifiable interpretation as `INFERENCE`
   - use `CONFIRMED` only after user, system-of-record, or verification-gate proof
   - link an existing issue instead of duplicating it
   - retire a disproved candidate rather than carrying it forward as active work
5. Include a `Defect family hypothesis` section only when the current task confirmed
   a defect and named the violated invariant. Bound candidate siblings to the same
   failure mode and label them `INFERENCE` until separately confirmed. Otherwise
   write `None.`.
6. Route any proposed follow-up as an unchecked `AGENT-TODO:` or `OWNER-GATE:`
   checkbox (OWNER-GATE only for the rule 11 rubric: secrets/credentials, external
   dashboards without API access, product/design-taste/policy decisions, merging T2
   workflows or your own PRs, spending money or writing to external accounts).
   Free-text "the owner should…" prose is banned. The handoff does not authorize a
   fix or automatic issue creation; implementation requires a separate claimed task.
7. If validation was skipped or blocked, state exact command and reason.

## Done criteria

- `docs/PROJECT_STATE.md` is updated when (and only when) the work materially changed shipped behavior, status, or governance; the oldest undecided KNOWN_ISSUES row was triaged alongside.
- Final handoff includes proof (commands + output), validation results, an UNVERIFIED list, limitations, risks, rollback plan, and docs status.
- Credible outside-scope observations are labeled and routed; duplicates and
  disproved candidates are not promoted into new work.
- Any skipped or failed validation is reported exactly.
