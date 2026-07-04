---
name: lifeos-calendar-external-writes
description: Use for LifeOS Google Calendar, free/busy, calendar adapters, external writes, OAuth scope risk, proposal acceptance, and calendar block safety controls.
---

# lifeos-calendar-external-writes

## Use when

- Touching Google Calendar adapters, free/busy, calendar proposal acceptance, external write logging, OAuth scopes, or calendar safety behavior.

## Boundaries

- `AGENTS.md`, authority docs, and direct instructions override this skill.
- No external calendar write without explicit user approval.
- AI cannot directly trigger calendar writes.
- OAuth scope, write-adapter, update/cancel, and deletion changes require explicit human review.
- Do not introduce autonomous rescheduling, broad sync, or a full conflict solver.

## Allowed V1 operations

- Query free/busy.
- Insert an event after explicit approval.
- Update/cancel app-created events only after explicit approval when that follow-on scope is approved.

## Forbidden operations

- Silent calendar writes.
- Autonomous rescheduling chains.
- Full calendar sync.
- AI-triggered writes without user confirmation.

## Procedure

1. Stage proposed writes locally/server-side, require explicit UI approval, execute server-side, and record `external_write_events` for every write.
2. Validate mock provider behavior before real provider behavior.
3. Keep Google write messaging framed as an approval gate, not ambient capability.
4. Keep local planning usable when Google env or connection is unavailable.
5. Flag OAuth/write-scope risks and keep changes minimal and reversible.

## Done criteria

- External writes still require explicit approval and logging.
- AI cannot directly trigger writes.
- Mock and real-provider boundaries are preserved.
- No forbidden calendar scope was added.
