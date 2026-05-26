# PR Review Escalation Policy

LifeOS Codex PR review is intentionally split into two passes:

- Baseline review always runs on non-draft PRs with `gpt-5.4-mini` at high effort.
- Escalated review runs only when the PR hits a deterministic risk trigger or the baseline reviewer explicitly asks for escalation.

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
