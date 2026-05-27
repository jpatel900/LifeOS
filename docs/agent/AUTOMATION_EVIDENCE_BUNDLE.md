# Automation Evidence Bundle

Use this when reviewing PRs created by low-risk issue automation or CI autofix automation.

## Required sections

Every agent-created or agent-repaired PR should include:

- linked issue or failed CI run
- route taken
- risk tier and propagated labels
- automation result or outcome status
- changed files
- acceptance-criteria coverage or CI-failure coverage
- validation commands with pass/fail status
- browser/manual proof when user-facing behavior changed
- risk surfaces touched
- risk surfaces intentionally not touched
- Codex summary
- rollback plan
- deferred items

## Reviewer use

Check the bundle in this order:

1. Confirm the route and linked issue or run match the PR purpose.
2. Confirm the changed files fit the claimed risk tier.
3. Confirm the validation section names exact commands and exact outcomes.
4. Confirm the coverage section explains why the PR satisfies the bounded task.
5. Confirm risky surfaces not touched are listed plainly instead of implied.
6. Confirm rollback and deferred items are specific enough to act on.

## Compactness rule

- Summarize artifacts; do not paste huge raw logs into the PR body.
- Link or reference the relevant run when more detail already exists there.
- Use `Not applicable.` explicitly when browser/manual proof is not needed.
- If a route has no linked issue, say that plainly instead of implying one exists.

## Failure rule

If the evidence bundle is vague, incomplete, or contradicts the diff:

- do not treat the PR summary as trusted proof
- request the smallest concrete clarification or fix
