---
name: lifeos-shipping
description: Use for LifeOS production-readiness and rollout checks so deployment, smoke proof, and rollback expectations stay explicit and conservative.
---

# lifeos-shipping

## Overview / purpose

Package the existing production rollout and post-deploy smoke expectations into a reusable LifeOS shipping workflow.

## When to use

- Preparing for a production deployment or production-like smoke pass.
- Reviewing whether a change is ready for rollout.
- Writing a deployment handoff or rollback plan.

## Do not use when

- The task is local-only coding with no rollout decision.
- The work changes production env, deployment config, or external-write posture without explicit human approval.

## Process

1. Read `README.md` and `docs/VERCEL_PRODUCTION_CHECKLIST.md`.
2. Confirm which integrations must be configured for the expected runtime path.
3. Check pre-deploy validation and risky-surface constraints.
4. Run or verify the required smoke routes: `/login`, `/settings/areas`, `/capture`, `/triage`, `/calendar`, `/execute`, `/review`, `/health`.
5. Treat Google Calendar testing as explicit-approval-only and use a non-critical calendar first.
6. Record rollback notes and remaining production-risk flags.

## Common rationalizations

- "If Vercel deployed, shipping is done." Deployment success is not product proof.
- "We can test Google on the real calendar later." Use a non-critical calendar and explicit approval.
- "Missing env just means Demo mode." Only if that degraded behavior is acceptable for the rollout goal.

## Red flags

- Production-only behavior assumed without env verification.
- Secrets or tokens proposed for client-visible surfaces.
- External-write behavior tested without explicit approval.

## Verification

- Pre-deploy checks are named.
- Smoke coverage spans the shipped workflow routes.
- Rollback steps and remaining risks are explicit.

## Done criteria

- Required rollout checks are complete or clearly marked missing.
- Risky integration prerequisites are stated plainly.
- Final handoff is proof-first and includes rollback notes.

## Authority / safety boundaries

- This skill does not authorize deployment, env changes, calendar writes, or external actions by itself.
- `AGENTS.md`, security rules, and explicit human approval gates override this skill.
