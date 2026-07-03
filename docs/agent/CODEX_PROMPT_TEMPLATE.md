# Codex Prompt Template

Manual fallback template for medium/high-risk work, local debugging, visual validation, governance/process changes, failed automation recovery, or a human-requested local Codex/Cursor run. Do not use this as the default for low-risk work.

## Defaults

- Authority: `AGENTS.md` first; implementation truth in the canonical docs it names.
- Read budget: search first, inspect only files needed for the task, and summarize the relevant facts before editing.
- Routing: use the routing table in `AGENTS.md`; load the smallest relevant repo-local skill set.
- Documentation: durable decisions go to `docs/adr/`; status/current-state changes go to `docs/PROJECT_STATE.md`; everything else belongs in git history and PR text.
- Output budget: return changed sections or diffs, tests run, risks, and rollback notes; never paste full files unless asked.
- Log budget: when reporting command or test output, include only failing tests, error lines, and exit codes — never full logs or passing-test noise.

## Required prompt skeleton

```md
Goal:
<exact outcome>

Mode:
<implementation / review / planning only>

Context:

- Read first: AGENTS.md
- Then: <smallest relevant authority docs/files>
- Skills: <smallest relevant skills from AGENTS.md routing table>
- Automation tier/risk: <low/medium/high; human gate if needed>
- Durable documentation required: <yes/no; if yes, ADR or PROJECT_STATE>

Acceptance criteria:

- <criterion 1>
- <criterion 2>

Impacted surfaces:

- Schemas/tables/functions/routes/docs/tests:
- Risky surfaces: <RLS/calendar/OAuth/schema/security/env/data deletion/etc. or none>

Verification Oracle:

- Behavior that must work:
- Test or command that proves it:
- UI/browser/manual proof if relevant:
- What must not change:
- Evidence required in final report:

Constraints:

- Keep scope narrow
- Preserve safety boundaries and mock fallbacks
- Do not broaden product/runtime behavior

Final proof format:

- Summary
- Files changed
- Validation run
- Risks / rollback / deferred items
```

## T3/T4 rule

High-risk or irreversible surfaces start as planning/review-only. Implementation proceeds only after explicit human approval for that exact surface.
