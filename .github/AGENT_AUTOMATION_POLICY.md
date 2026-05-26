# Agent Automation Policy

This file defines the required human gate for agent-driven repo changes and GitHub automation in LifeOS.

If a task spans multiple categories, apply the highest tier.
If classification is unclear, choose the stricter tier.
CI and validation requirements from `AGENTS.md` still apply. This policy adds human-gate rules; it does not create exceptions.

## T0 — Fully automatable after CI

Allowed without extra human review once required checks pass:

- docs-only
- prompt copy
- issue templates
- test-only additions that do not weaken assertions

## T1 — Agent PR allowed, human review recommended

Agent may implement and open a PR. Human review is recommended before merge.

- isolated UI copy
- small test fixes
- route smoke coverage
- non-risky workflow file improvements

## T2 — Agent implementation allowed, human review required

Agent may implement, but a human must review before merge or rollout.

- cross-flow UX
- parser UI
- health behavior
- observability display
- workflow data layer changes

## T3 — Planning or implementation only with explicit human approval

Do not plan or implement beyond bounded analysis unless a human explicitly approves this surface.

- Supabase schema
- migrations
- RLS
- auth
- OAuth
- Google Calendar writes
- AI parser contracts
- observability privacy
- secrets/env
- production deployment

## T4 — Human decision before any implementation

Do not implement. Stop at framing, tradeoffs, or requirements clarification until a human makes the decision.

- new vendors
- new external write capabilities
- background jobs
- autonomous scheduling
- broad architecture changes
- scope expansion beyond requirements
