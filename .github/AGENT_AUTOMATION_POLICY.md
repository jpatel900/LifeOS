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

Current deterministic safe auto-merge allowlist:

- `docs/**`
- `README.md`
- `.github/ISSUE_TEMPLATE/**`
- `.agents/skills/**` (owner-approved 2026-07-03 after the epic #243 pipeline proved the lane)

## T1 — Agent PR allowed, human review recommended

Agent may implement and open a PR. Human review is recommended before merge.

- isolated UI copy
- route smoke coverage

Typical paths:

- `apps/web/src/app/**` when the change is narrow copy-only or bounded smoke coverage
- `apps/web/tests/e2e/**` when the change is bounded smoke coverage rather than assertion-changing broad test rewrites

Planning-only note:

- If the correct implementation slice is unclear, use `agent:plan` first instead of guessing.

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

Typical paths:

- `.github/workflows/**`
- `.github/codex/prompts/**`
- `scripts/agent/**`
- `apps/web/src/__tests__/**`
- `apps/web/tests/e2e/**` when behavior assertions materially change
- `apps/web/src/lib/observability/**` for UI-facing observability behavior

## Guardrail references

- Safe auto-merge evaluator and revocation guard: `.github/workflows/safe-automerge.yml` and `scripts/agent/check-safe-automerge.mjs`
- Shared automation path policy: `scripts/agent/automation-policy.mjs`
- Shared automation path guard: `scripts/agent/check-automation-scope.mjs`
- PR risk classification: `scripts/agent/classify-pr-risk.mjs`
- PR evidence guidance: `AGENTS.md` rule 15 (verified claims, validation evidence, SELF-AUDIT)
- Decision review guidance: `docs/adr/` (architecture decisions) and `AGENTS.md` change-control rules

## Hands-off path matrix

Use this as the deterministic routing summary before opening or merging an automation-driven PR.

| Tier | Hands-off status                                                  | Allowed path examples                                                                                                                                                                 | Notes                                                                                                                                      |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T0   | Safe auto-merge allowed after CI and review gates                 | `docs/**`, `README.md`, `.github/ISSUE_TEMPLATE/**`, `.agents/skills/**`                                                                                                              | Requires `agent:ready`, `risk:low`, and `automerge:safe`. The safe auto-merge allowlist must stay exactly here unless separately approved. |
| T1   | Agent may open PR; human review recommended                       | Narrow `apps/web/src/app/**` copy-only edits, bounded route-smoke coverage                                                                                                            | Not auto-merge eligible. Use when the blast radius is still low but not purely documentation metadata.                                     |
| T2   | Agent may open PR; human review required                          | `.github/workflows/**`, `.github/codex/prompts/**`, `scripts/agent/**`, meaningful test assertion changes                                                                             | Control-plane and assertion-bearing work stays out of hands-off merge lanes.                                                               |
| T3   | Planning first; implementation only after explicit human approval | `supabase/**`, `**/migrations/**`, `apps/web/src/lib/supabase/**`, `apps/web/src/lib/ai/**`, `apps/web/src/lib/googleCalendar/**`, `apps/web/src/app/api/google-calendar/**`, `.env*` | Sensitive auth, persistence, parser, calendar, secrets, and deployment-adjacent surfaces.                                                  |
| T4   | Human decision before any implementation                          | New vendor/service surfaces, new background automation surfaces, scope-expansion surfaces                                                                                             | Requires an explicit human decision and usually requirements/policy updates first.                                                         |

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

Planning route:

- `agent:plan` is the preferred GitHub-first planning route for T2/T3 issues that still need repo research, risk classification, test mapping, or a smallest-safe-slice recommendation.
- The planning route may comment on the issue but must not create branches, commits, or implementation PRs.

## T4 — Human decision before any implementation

Stop at planning/review-only, tradeoffs, or requirements clarification until a human makes the decision. Implementation may proceed only after explicit human approval and any resulting requirements or policy update.

- new vendors
- new external write capabilities
- background jobs
- autonomous scheduling
- broad architecture changes
- scope expansion beyond requirements
