# UI Degraded-State Copy

Status: Active Pass 7 shared rule for degraded and blocked state wording
Purpose: Keep degraded-state copy calm, truthful, and actionable across workflow routes before route-specific cleanup starts
Read when: Writing warning or danger copy, revising fallback messaging, or deciding whether a route state still has a safe next move
Do not use for: Severity selection by itself, developer-detail placement, or permission to rewrite route structure outside scoped issues
Superseded by: n/a; amend this file rather than creating competing degraded-state wording rules

## Default contract

For degraded or blocked workflow copy, answer these three questions in plain language:

1. What happened?
2. What still works?
3. What should the user do next?

If the copy cannot answer all three, it is usually incomplete.

## Tone rules

- Prefer calm verbs such as `continue`, `retry`, `connect`, `check`, `open`, and `fix`.
- Name the affected surface directly instead of using generic `error` framing when the route still works.
- Keep blame, shame, and drama out of workflow copy.
- Do not leak stack traces, provider jargon, or internal identifiers into the first-scan message.

## Message shape

Use this order by default:

1. affected capability
2. safe fallback or still-working path
3. next repair or setup step

Example pattern:

- `Account data is partially unavailable. Local workflow still works. Check Health if this keeps happening.`

## Severity alignment

- `info`: intentional limit or local-only mode without urgent repair
- `warning`: degraded but still usable
- `danger`: blocked trust or failed action

If the user still has a safe next move, start from `info` or `warning` language before escalating to `danger`.

## Route anchors

- `Home`: explain what data is degraded, confirm the launchpad still works, and point to `Health` for persistent trust problems.
- `Capture`: preserve raw-save truth first, then explain sorting fallback or retry options.
- `Planning`: explain whether local planning still works before mentioning Google-specific recovery.
- `Health`: keep repair wording plain, explicit, and free of raw exception detail.

## Anti-patterns

- `Something went wrong.` with no safe next move
- `Fatal` or destructive framing for recoverable fallback states
- raw provider or infrastructure jargon in the main alert
- telling the user to retry without saying whether work was still saved
