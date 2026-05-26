# Agent Automation Policy

This file defines the required human gate for agent-driven repo changes and GitHub automation in LifeOS.

LifeOS product/runtime automation remains tightly restricted by `AGENTS.md` and product authority docs.
Engineering automations may write only to isolated branches and approved GitHub metadata surfaces such as pull requests or issue comments. They must be label-gated, path-guarded, validation-gated, and must not touch production data, secrets, non-GitHub external systems, or LifeOS runtime state.
Safe auto-merge also requires the repository-level GitHub auto-merge setting to be enabled. Without that repo setting, the workflow remains a guard/evaluator and cannot successfully arm auto-merge.

If a task spans multiple categories, apply the highest tier.
If classification is unclear, choose the stricter tier.
CI and validation requirements from `AGENTS.md` still apply. This policy adds human-gate rules; it does not create exceptions.

## T0 — Fully automatable after CI

Allowed without extra human review once required checks pass:

- docs-only
- issue templates

## T1 — Agent PR allowed, human review recommended

Agent may implement and open a PR. Human review is recommended before merge.

- isolated UI copy
- route smoke coverage

## T2 — Agent implementation allowed, human review required

Agent may implement, but a human must review before merge or rollout.

- small test fixes
- test-only additions or assertion-affecting test changes until a stronger assertion-preservation guard exists
- workflow file changes
- automation control-plane files such as `.github/codex/prompts/**`
- cross-flow UX
- parser UI
- health behavior
- observability display
- workflow data layer changes

## T3 — Planning or implementation only with explicit human approval

Start with planning/review-only. Do not implement beyond bounded analysis unless a human explicitly approves the exact surface. After approval, keep implementation bounded to that approved surface.

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

Stop at planning/review-only, tradeoffs, or requirements clarification until a human makes the decision. Implementation may proceed only after explicit human approval and any resulting requirements or policy update.

- new vendors
- new external write capabilities
- background jobs
- autonomous scheduling
- broad architecture changes
- scope expansion beyond requirements
