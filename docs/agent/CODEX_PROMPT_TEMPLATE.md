# Codex Prompt Template

Use this template for medium/high-risk work, local debugging, governance/process changes, or any task that needs a bounded Codex prompt.

Authority and routing:

- `AGENTS.md` is the repo authority for agent behavior.
- Start with the smallest relevant context: `docs/agent/CONTEXT_INDEX.md`, `pnpm agent:context <area>`, then `docs/PROJECT_STATE.md` only as needed.
- Use `.github/AGENT_AUTOMATION_POLICY.md` for T0-T4 automation tiering and T3/T4 planning-first gates.
- Use `docs/implementation-notes/README.md` when medium/high-risk work requires a durable note.

Delivery defaults:

- GitHub-first is the default for repo delivery: issues, PRs, labels, review workflows, and branch-scoped automation.
- Local Codex CLI is allowed for medium/high-risk, local debugging, or governance hardening when direct repo work is safer or faster under active human supervision.
- For medium/high-risk or cross-flow work, use the role-separated checkpoints in `docs/agent/ROLE_SEPARATED_DELIVERY.md` so research/spec/build/test/validation are explicit.
- Use `docs/agent/VALIDATION_MATRIX.md` to choose focused iteration checks by change type and T0-T4 tier; do not default T0 docs or template work to full repo validation when no code changed.
- For T2 workflow behavior, cross-flow UX, health meaning changes, parser UI, observability display, or workflow data behavior, attach or define a scenario pack before implementation.
- Do not copy all repo law into the prompt. Point back to `AGENTS.md` and the smallest relevant doc set.

## Required Prompt Skeleton

```md
Goal:
<exact outcome>

Mode:
<implementation / review / planning only>

Context:

- Read first: AGENTS.md
- Then the smallest relevant context/doc set only
- Automation tier: <T0/T1/T2/T3/T4 from .github/AGENT_AUTOMATION_POLICY.md>
- Implementation note required: <yes/no; if yes, use docs/implementation-notes/YYYY-MM-DD-<task-slug>.md>

Role-separated checkpoints:

- Research/spec checkpoint: <requirement anchor, current behavior, smallest approved approach, non-goals>
- Scenario pack: <required or not required; if required, include scenario, failure paths, proofs, and rollback notes>
- Build checkpoint: <exact surface allowed to change>
- Test/validation checkpoint: <commands, review proof, human gate if any>

Verification Oracle:

- User journey or behavior that must work:
- Test or command that proves it:
- UI/browser/manual proof if relevant:
- Exact acceptance criteria:
- What must not change:
- Evidence required in final report:

Constraints:

- Keep scope narrow
- Preserve existing safety boundaries
- Do not broaden product/runtime behavior

Final proof format:

- Summary
- Files changed
- Validation run
- Contradictions resolved
- Risks / rollback / deferred items
```

## Verification Oracle

Every medium/high-risk, local-debugging, governance, or otherwise ambiguous implementation prompt should define a Verification Oracle before editing:

- the exact user journey or behavior that must work
- the linked scenario pack when the task is T2 workflow behavior rather than narrow T0/T1 work
- the test or command that proves it
- UI/browser/manual proof when the task affects UX or operator-facing behavior
- exact acceptance criteria and the research/spec checkpoint it must satisfy
- what must not change
- which `docs/ENGINEERING_INVARIANTS.md` invariants the change touches (multi-step write, new table, vendor call, module budget) and how each is satisfied
- the evidence required in the final report

If the Oracle is missing, the prompt is underspecified.

## T3/T4 Rule

- T3/T4 surfaces start as planning/review-only.
- Implementation may proceed only after explicit human approval for that exact surface.

## Final Proof Standard

The final report should be proof-first, not narrative-first:

- what changed
- what was intentionally not changed
- exact validation run
- exact remaining risks or limitations
- rollback plan
