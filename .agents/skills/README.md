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

- Use `skill-router` before substantial work to choose the smallest relevant trusted skill set; the routing table lives in `AGENTS.md` (Skill routing).
- Shortcut traps and rebuttals live inside each skill's own "Common rationalizations" section (required anatomy above) — there is no separate repo-wide file.
- The vendored set below is allowlisted by `.vendored-manifest.json` (pruned 2026-08-04 to the skills the `AGENTS.md` routing table names). To vendor a new skill, add its manifest entry in a reviewed PR; the daily sync only manages manifest-listed dirs.

<!-- vendored-skills:begin (managed by sync-skills-to-lifeos.ps1; do not edit inside markers) -->

## Vendored skills (synced 2026-08-07)

Everything below is auto-vendored from the maintainer's curated hub so cloud agents get the
same skills as local tools. Do not hand-edit vendored skills here - fix them at their source
and let the daily sync PR carry the change. Ownership list: `.vendored-manifest.json`.
Repo-native skills (`lifeos-*`, `skill-router`, etc.) always win on any overlap.
Third-party skills remain under their upstream repos' licenses.

- **addy-agent-skills**: browser-testing-with-devtools, documentation-and-adrs, frontend-ui-engineering, security-and-hardening
- **claude-user-skills**: agentic-docs-and-writing
- **local-hub**: impeccable
- **superpowers**: verification-before-completion

<!-- vendored-skills:end -->



















