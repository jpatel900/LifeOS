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
