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

## Vendored general library: `agentic-*` (16 skills)

The `agentic-*` skills are vendored copies of the maintainer's general agentic-engineering
library (authoring home: `~/.claude/skills` on the maintainer's machine; vendored 2026-07-02
so cloud agents, which cannot see that machine, get the same discipline).

- Anatomy differs deliberately from the LifeOS anatomy above: they use
  purpose → when to use / when NOT to use → body → "Provenance and maintenance"
  (treat the provenance section as their verification block).
- Precedence: general method only, subordinate to `AGENTS.md` and to every `lifeos-*`
  skill. When a `lifeos-*` skill covers the same ground (e.g. `lifeos-debugging` vs
  `agentic-debugging-playbook`), load the `lifeos-*` skill first; use the `agentic-*`
  skill for general method it does not cover. Nothing in them authorizes routing
  around LifeOS gates — they defer to project change control by design.
- Do not hand-edit `agentic-*` skills here; fix them in the authoring home and re-sync,
  or the copies fork. Re-sync (maintainer machine only):
  `Get-ChildItem "$HOME\.claude\skills" -Directory -Filter agentic-* | ForEach-Object { Copy-Item $_.FullName ".agents\skills\" -Recurse -Force }`
