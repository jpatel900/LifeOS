# Automation Decision Log

Use GitHub-native surfaces first for agent-delivery decision logging.

## What to record

For each automation attempt, capture:

- issue number or PR number
- linked failed CI run when applicable
- labels and risk tier
- route taken:
  - low-risk issue automation
  - CI autofix
  - planning-only automation
  - manual Codex CLI
  - Cursor
  - human-only
- outcome:
  - PR opened
  - no changes
  - needs human review
  - merged
  - reverted
  - failed validation
- reason for escalation or block
- validation summary
- whether human intervention was required
- do not dump raw logs; summarize and point to the authoritative run or PR when needed

## Preferred storage surfaces

- workflow run summary for per-run outcome
- issue comment for issue-routed automation outcomes
- PR body for durable evidence on generated PRs
- implementation note or docs update when the policy or workflow meaning changes

Do not add app runtime telemetry or a database table for this purpose in V1.

## Monthly review checklist

Once enough runs exist, review:

1. Which routes produced the most `needs human review` outcomes?
2. Which path guards blocked useful work versus correctly blocked risky work?
3. Which validation steps fail most often?
4. Which routes required human intervention despite nominal automation?
5. Which safe-auto-merge paths stayed stable, and which should remain manual?

## Review outcome categories

- keep as-is
- tighten guardrails
- improve evidence bundle quality
- narrow the allowed surface
- expand only with explicit policy approval
