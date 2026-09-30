---
name: lifeos-planning
description: Use for LifeOS planning, architecture, phase selection, requirement mapping, acceptance criteria, and task breakdown before implementation.
---

# lifeos-planning

## Use when

- Scoping new implementation work.
- Choosing phase alignment or architecture direction.
- Defining acceptance criteria and test scope.
- Ordering the work.

Skip it when the work is already scoped and you are making a small mechanical change.

## Boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- Don't use it to bypass approvals or infer unstated product requirements.
- Flag risky surfaces before edits: RLS, schema contracts, external writes, OAuth scopes, secrets, destructive operations.

## Procedure

1. Read `AGENTS.md` and `docs/PROJECT_STATE.md`.
2. Identify the capability's dependencies, risk class, and any evidence gate. Stage labels give ordering context, not a blanket build prohibition.
3. Map the request to existing `REQUIREMENTS.md` scope.
4. Identify impacted schemas, tables, functions, routes, and risky surfaces.
5. Write acceptance criteria and the tests that prove them.
6. Stay inside an owner-ratified requirement or issue. Under ADR 0005, data-independent foundations may proceed when their structural prerequisites are met. Keep usage gates for behavior that depends on personal evidence, trust, interruption rights, external writes, or data-derived policy.
7. Plan the full requested scope in a sensible order (dependencies first, each step working), and keep mock-mode behavior where required.

## Done when

- Dependencies, risk class, and evidence gates are named.
- The task maps to existing requirements, or the gap is flagged.
- Acceptance criteria and tests are defined.
- Risky surfaces are named.
