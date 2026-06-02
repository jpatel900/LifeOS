# PR Review Escalation Policy

LifeOS Codex PR review is intentionally split into two passes:

- Baseline review runs on non-draft human-authored PRs with `gpt-5.4-mini` at medium effort.
- Escalated review runs on `gpt-5.4` at high effort only when the PR hits a deterministic risk trigger or the baseline reviewer explicitly asks for escalation.
- Bot-authored PRs are intentionally skipped by this workflow because the review action requires a triggering actor with write-capable repository access, which permissionless bot actors like `dependabot[bot]` do not have.

## Deterministic escalation triggers

Escalate immediately when any of these are true:

- labels include `risk:high`, `needs:human-decision`, `area:security`, `area:supabase`, `area:calendar`, `area:parser`, `area:observability`, or `area:deployment`
- changed paths hit Supabase, Google Calendar, AI/parser, observability, workflow, env, or dependency-control surfaces
- changed file count is greater than 20
- additions plus deletions are greater than 800

## Baseline reviewer escalation

The baseline prompt must end with:

- `ESCALATE_RECOMMENDED: true|false`
- `ESCALATION_REASON: <short reason or none>`

Use that only when the baseline pass sees a real high-risk boundary or cannot make a confident call without deeper review.

## Review boundaries

- Baseline review covers the whole PR cheaply.
- Escalated review covers high-risk concerns only and should not duplicate the whole baseline review.
- Neither workflow path may push code, create patches, or widen permissions beyond review/comment needs.
- Bot-authored PRs still rely on CI, deployment checks, and human review; the Codex review workflow is not their merge gate.
