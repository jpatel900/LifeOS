---
name: lifeos-planning
description: Use for LifeOS planning, architecture, phase selection, requirement mapping, acceptance criteria, scope control, and task breakdown before implementation.
---

# lifeos-planning

## Use when

- Scoping new implementation work.
- Choosing phase alignment or architecture direction.
- Defining acceptance criteria and test scope.
- Breaking work into safe, minimal tasks.

## Do not use when

- Work is already scoped with clear acceptance criteria and you are only executing a small mechanical change.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Do not use this skill to broaden scope, bypass approvals, or infer unstated product requirements.
- Flag risky surfaces before edits: RLS, schema contracts, external writes, OAuth scopes, secrets, and destructive operations.

## Procedure

1. Read `AGENTS.md` and `docs/PROJECT_STATE.md` before planning.
2. Identify the capability's dependencies, risk class, and any evidence gate before proposing changes; stage labels provide ordering context, not a blanket build prohibition.
3. Map the request to existing `REQUIREMENTS.md` scope before implementation.
4. Identify impacted schemas, tables, functions, routes, and risky surfaces.
5. Write explicit acceptance criteria and required tests before editing files.
6. Keep scope inside an owner-ratified requirement or issue. Under ADR 0005, data-independent foundations may proceed when their structural prerequisites are met; retain usage gates for behavior that depends on personal evidence, trust, interruption rights, external writes, or data-derived policy.
7. Prefer the smallest safe implementation path and preserve mock-mode behavior where required.

## Done criteria

- Dependencies, risk class, and applicable evidence gates are identified.
- The task is mapped to existing requirements or the scope gap is explicitly flagged.
- Acceptance criteria and required tests are defined before edits.
- Risky surfaces are identified.
