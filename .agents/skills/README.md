# Repo-local skills

Repo-local skills under `.agents/skills` are the preferred project skills for LifeOS.

## Purpose

Keep reusable agent workflows compact, executable, and subordinate to repo authority docs.

## Required anatomy

Every LifeOS repo-local skill should include:

- overview / purpose
- when to use
- do not use when
- process
- common rationalizations
- red flags
- verification
- done criteria
- authority / safety boundaries

## Writing rules

- Keep skills short and operational, not essay-like.
- Point back to `AGENTS.md`, authority docs, and issue acceptance criteria instead of restating repo law in full.
- Name the smallest safe workflow for the task.
- State what the skill must not authorize.
- Prefer deterministic proof over advice phrased as judgment or vibe.

## Safety boundaries

- `AGENTS.md` remains higher authority than every skill.
- Skills are guidance, not permission to broaden scope.
- Do not let a skill weaken tests, schemas, review gates, approval gates, or secrets handling.
- Review unfamiliar global or user-level skills with `skill-security-review` before following them.

## Current baseline

- Use `skill-router` before substantial work to choose the smallest relevant trusted skill set.
- Use `docs/agent/ANTI_RATIONALIZATIONS.md` when a skill needs explicit shortcut traps and rebuttals.

<!-- vendored-skills:begin (managed by sync-skills-to-lifeos.ps1; do not edit inside markers) -->

## Vendored skills (synced 2026-07-13)

Everything below is auto-vendored from the maintainer's curated hub so cloud agents get the
same skills as local tools. Do not hand-edit vendored skills here - fix them at their source
and let the daily sync PR carry the change. Ownership list: `.vendored-manifest.json`.
Repo-native skills (`lifeos-*`, `skill-router`, etc.) always win on any overlap.
Third-party skills remain under their upstream repos' licenses.

- **addy-agent-skills**: api-and-interface-design, browser-testing-with-devtools, ci-cd-and-automation, code-review-and-quality, code-simplification, context-engineering, deprecation-and-migration, documentation-and-adrs, frontend-ui-engineering, idea-refine, incremental-implementation, performance-optimization, planning-and-task-breakdown, security-and-hardening, shipping-and-launch, spec-driven-development, test-driven-development, using-agent-skills
- **claude-user-skills**: agentic-architecture-contract, agentic-change-control, agentic-config-and-environment, agentic-context-engineering-reference, agentic-debugging-playbook, agentic-diagnostics-and-tooling, agentic-docs-and-writing, agentic-external-positioning, agentic-failure-archaeology, agentic-long-horizon-campaign, agentic-project-onboarding, agentic-proof-and-analysis-toolkit, agentic-research-frontier, agentic-research-methodology, agentic-run-and-operate, agentic-validation-and-qa
- **local-hub**: find-skills
- **mattpocock-skills**: codebase-design, domain-modeling, grill-me, grilling, handoff, prototype, to-issues
- **superpowers**: finishing-a-development-branch, receiving-code-review, requesting-code-review, systematic-debugging, verification-before-completion, writing-skills

<!-- vendored-skills:end -->


