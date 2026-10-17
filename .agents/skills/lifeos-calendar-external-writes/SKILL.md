---
name: lifeos-calendar-external-writes
description: Use for LifeOS Google Calendar, free/busy, calendar adapters, external writes, OAuth scope risk, proposal acceptance, and calendar block safety controls.
---

# lifeos-calendar-external-writes

The calendar red line in `AGENTS.md` governs (no write without explicit user approval; every write records `external_write_events`). OAuth scopes and calendar write logic are on the Human review list.

- **Allowed:** query free/busy; insert an event after explicit approval; update/cancel only app-created events (deterministic id + provenance marker, etag-checked) after explicit approval.
- **Forbidden:** silent writes, AI-triggered writes without user confirmation, autonomous rescheduling chains, full calendar sync.
- **Flow:** stage the proposed write, require explicit UI approval, execute server-side (`apps/web/src/lib/googleCalendar/`, `apps/web/src/lib/externalWrites/`), log the write. Present Google writes as an approval gate, not ambient capability.
- **Proof:** mock provider first; real Google only with owner approval on a non-critical calendar. Local planning keeps working when Google env or the connection is missing.
