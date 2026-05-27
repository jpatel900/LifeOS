# Agentic Delivery Phase B Planning Lane

- Task name: `#57 #58 #62 #53` planning lane and policy docs
- Branch: `governance/agentic-delivery-phase-b-planning-lane`

## Original scope

Add the read-only `agent:plan` workflow, define scenario packs for T2 workflow behavior, define a policy-only verified-medium automation lane, and close the parent umbrella after the child work is done.

## Assumptions

- The planning workflow must stay GitHub-first and read-only except for issue comments.
- Scenario packs should raise the proof bar for T2 work without turning T0/T1 work into ceremony.
- Verified-medium stays spec-only in this batch; any real enablement belongs in a later, separately approved change.

## Decisions

- Added `.github/workflows/codex-issue-plan.yml` as a dedicated planning-only route instead of overloading the low-risk implementation workflow.
- Kept the planning route bounded to issue comments with `contents: read` and `issues: write`; no branch, commit, or PR behavior exists in that workflow.
- Wrote issue context into runner temp instead of tracked repo files so the workflow does not mutate repository content during planning runs.
- Defined scenario packs in a dedicated doc and referenced them from the issue template and prompt template instead of embedding a long process block into `AGENTS.md`.
- Defined verified-medium as a policy-only doc with explicit eligible/ineligible surfaces and rollout stages, without enabling any workflow, label, or merge path.

## Deviations

- None. The branch stayed in governance docs, issue template/prompt updates, and one new read-only workflow only.

## Tradeoffs

- A dedicated planning workflow is slightly more surface area than extending an existing workflow, but it is clearer and safer because it cannot accidentally inherit implementation behavior.
- Requiring a `scenario_pack` field only by repo guidance rather than conditional form logic is less strict, but GitHub issue forms do not support reliable conditional requirements without creating worse T0/T1 friction.
- The verified-medium doc is intentionally aspirational. It creates no operational benefit until a later dry-run or PR-comment stage is separately approved.

## Files changed and why

- `.github/workflows/codex-issue-plan.yml`: new read-only issue-planning workflow.
- `.github/codex/prompts/issue-plan.md`: bounded planning prompt for the workflow.
- `.github/labels.md`: documented `agent:plan`.
- `.github/AGENT_AUTOMATION_POLICY.md`: documented the planning route and policy-only verified-medium boundary.
- `.github/ISSUE_TEMPLATE/agent-task.yml`: added scenario-pack guidance for T2 workflow behavior.
- `docs/agent/CODEX_PROMPT_TEMPLATE.md`: added scenario-pack expectations for medium-risk workflow behavior.
- `docs/agent/SCENARIO_PACKS.md`: scenario-pack standard plus examples.
- `docs/agent/VERIFIED_MEDIUM_AUTOMATION.md`: future verified-medium policy/spec.
- `docs/agent/ISSUE_PLANNING_AUTOMATION.md`: when to use `agent:plan`.
- `docs/PROJECT_STATE.md`: concise state update and implementation note reference.

## Validation commands and results

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm format:check`
- `git diff --check`

Results:

- `pnpm lint`: passed
- `pnpm type-check`: passed
- `pnpm test`: passed
- `pnpm build`: passed
- `pnpm format:check`: repo-baseline failure only in unrelated files `apps/web/src/app/page.tsx`, `README.md`, and `scripts/run-playwright-e2e.mjs`
- `git diff --check`: passed

## Risks

- The new workflow depends on prompt discipline and read-only sandboxing; if future edits broaden permissions or add branch/PR steps, the route stops being safe.
- Scenario-pack guidance could turn performative if future issues use it as prose without proof mapping.
- The verified-medium doc could be misread as authorization instead of policy-only unless future edits keep the “not enabled” boundary explicit.

## Deferred items

- No verified-medium workflow, label, or auto-merge behavior was implemented here.
- Any future T2 reduced-human-friction lane still needs separate dry-run and proof-stage work.

## Rollback notes

- Revert the branch commit that adds the planning workflow and policy docs.
- If only the workflow proves problematic, remove `.github/workflows/codex-issue-plan.yml` and `.github/codex/prompts/issue-plan.md` first while leaving the scenario-pack and verified-medium docs for later review.
