# Role-Separated Delivery

This document adds engineering workflow guidance only.

It does not change LifeOS product/runtime architecture.
It does not permit in-app multi-agent behavior.
It does not replace the existing GitHub-first delivery path.

## Purpose

Use explicit delivery checkpoints for medium-risk, high-risk, governance, cross-flow, or ambiguous work so research, specification, build, test, and validation are separated on purpose instead of blended into one vague implementation pass.

One human or one coding agent may perform multiple roles sequentially.
The separation is conceptual and procedural, not a requirement to run multiple tools, models, or agents in parallel.

## Checkpoints

### 1. Research checkpoint

Confirm:

- the task maps to an existing requirement, policy, or approved issue scope
- the smallest relevant authority docs and current behavior were checked
- risky surfaces and unknowns are named explicitly
- scope-expanding ideas are called out as out of scope

Primary artifact:

- the issue body, especially the research/spec checkpoint, files/docs to read, and forbidden changes

### 2. Spec checkpoint

Define:

- exact acceptance criteria
- the smallest approved approach
- what must not change
- required validation commands
- whether human approval is required

Primary artifact:

- the issue acceptance criteria plus the Verification Oracle for medium/high-risk or cross-flow work

### 3. Build checkpoint

Implement only the approved surface:

- keep changes narrow
- preserve existing safety gates
- do not smuggle in runtime architecture changes, new vendors, or workflow rewrites

Primary artifact:

- the scoped branch / PR diff

### 4. Test checkpoint

Run the validation listed for the task and any additional checks required by `AGENTS.md` for the touched surface.

Primary artifact:

- exact command results recorded in the final handoff or PR summary

### 5. Validation checkpoint

Compare the implementation against:

- issue acceptance criteria
- the research/spec checkpoint
- forbidden changes
- repo authority docs and risk gates

Primary artifact:

- PR review comments, human review, and merge decision

If the validator does not have trusted access to the issue checkpoint context, the validator must say that plainly instead of pretending the comparison happened.

## Mapping To The Existing GitHub Flow

LifeOS already has the right backbone:

1. Issue defines the bounded task, acceptance criteria, research/spec checkpoint, forbidden changes, risk tier, and required validation.
2. Builder implements the smallest approved change on a narrow branch or PR.
3. CI and Codex review validate the diff without weakening existing guards.
4. Human review and merge follow `.github/AGENT_AUTOMATION_POLICY.md`.

This means role separation is layered onto the current issue -> PR -> CI/review pipeline rather than replacing it.

## Required Boundaries

- Do not interpret this doc as permission for runtime multi-agent behavior inside LifeOS.
- Do not add new GitHub Actions workflows, vendors, dependencies, or orchestration files just to simulate role separation.
- Do not weaken T0-T4 automation gates, CI, PR review, auto-merge guards, or human approval rules.
- Do not treat PR-authored restatements of issue scope as trusted review inputs unless they are independently verified.

## Where It Shows Up

- `.github/ISSUE_TEMPLATE/agent-task.yml` should capture the research/spec checkpoint.
- `docs/agent/CODEX_PROMPT_TEMPLATE.md` should require the checkpoint and Verification Oracle for medium/high-risk or cross-flow work.
- PR review prompts should compare diffs against the checkpoint and forbidden changes when trusted issue context is available, and should report the gap when it is not.
