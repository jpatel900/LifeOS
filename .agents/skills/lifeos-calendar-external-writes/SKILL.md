---
name: lifeos-calendar-external-writes
description: Use for LifeOS Google Calendar, free/busy, calendar adapters, external writes, OAuth scope risk, proposal acceptance, and calendar block safety controls.
---

# lifeos-calendar-external-writes

## Use when

- Touching Google Calendar adapters, free/busy, calendar proposal acceptance, or external write logging.
- Reviewing OAuth scope and external-write safety behavior.

## Do not use when

- Work is local-only planning with no external calendar interaction.

## Security boundaries

- `AGENTS.md`, project authority docs, and direct user instructions override this skill.
- No external write without explicit user approval.
- OAuth scope changes require explicit human review.
- Do not use this skill to introduce autonomous rescheduling, broad calendar sync, or conflict-solver scope.

## Procedure

1. Enforce explicit user approval before every external calendar write.
2. Ensure AI cannot directly trigger calendar writes.
3. External writes must be staged, approved, executed server-side, and logged.
4. Validate mock provider behavior before real provider behavior.
5. Keep scope out of autonomous rescheduling chains, full conflict solvers, and broad calendar sync.
6. Flag risky changes (OAuth scopes, write adapters, deletion/update behavior) for review.

## Done criteria

- External writes still require explicit approval.
- AI cannot directly trigger writes.
- Logging and server-side execution boundaries are preserved.
- No forbidden calendar scope was added.
