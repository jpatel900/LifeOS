# Pass 7 Final Audit Rubric

- Task name: `#202 Add final audit scoring rubric`
- Branch: `pass-7-issue-200-hardening`

## Original scope

Define the final Pass 7 audit rubric before later route implementation claims can rely on it, and connect that rubric directly to issue `#198`.

## Assumptions

- The final audit should be a durable repo document, not only a GitHub issue-body paragraph.
- Route-by-route audit evidence must be stricter than ordinary implementation notes because `#199` depends on it for closeout truth.
- GitHub write access is still unavailable, so the connection to `#198` must be recorded locally for later backfill.

## Decisions

- Added `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md` as the canonical scoring standard for `#198` and `#199`.
- Included the required routes, evidence prerequisites, 0-to-3 scale, dimension definitions, thresholds, worksheet, and closeout rule.
- Updated `docs/agent/UI_PASS_7_EXECUTION_MAP.md` so the `#202` and `#198` rows point directly to the rubric document.
- Added the exact GitHub-side `#202` comment to `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`.

## Deviations

- No GitHub issue edits were applied directly because `gh auth status` still reports an invalid token.

## Tradeoffs

- A dedicated rubric doc adds one more governance file, but it is better than letting final-audit standards drift inside issue comments or chat.
- The audit worksheet is intentionally plain Markdown so it can be copied into issue `#198`, a PR, or an implementation note without translation.

## Files changed and why

- `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`
  - Added the canonical Pass 7 final audit standard and worksheet.
- `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
  - Linked `#202` and `#198` directly to the rubric.
- `docs/agent/UI_PASS_7_GITHUB_UPDATES.md`
  - Added the exact GitHub comment text for `#202`.
- `docs/implementation-notes/2026-06-08-pass-7-final-audit-rubric.md`
  - Preserved the audit-governance decisions and write-auth blocker.

## Validation commands and results

- `git diff --check`
  - passed
- `pnpm lint`
  - passed
- `pnpm type-check`
  - passed
- `pnpm test`
  - passed
- `pnpm build`
  - passed

## Risks

- The rubric now exists in repo docs, but GitHub issue `#198` will still need the back-reference once auth is restored.
- If later implementation skips screenshot collection or route-level evidence, the rubric will be correct but the audit will still fail.

## Deferred items

- Apply the `#202` GitHub comment once write auth is restored.
- Use the worksheet during `#198` instead of inventing a looser route-audit format.

## Rollback notes

- Revert the four files above only.
- Do not relax the audit threshold language while rolling back this issue.
