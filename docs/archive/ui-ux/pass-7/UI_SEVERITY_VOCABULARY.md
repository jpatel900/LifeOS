# UI Severity Vocabulary

Status: Active Pass 7 shared rule for route-state severity
Purpose: Define when LifeOS should use success, info, warning, or danger framing across workflow routes
Read when: Writing degraded-state copy, choosing alert or badge tone, adding severity tests, or deciding whether a route is blocked versus still usable
Do not use for: Detailed route hierarchy rules, developer diagnostics placement, or permission to restyle everything at once
Superseded by: n/a; amend this file rather than creating competing severity docs

## Canonical severities

### `success`

Use when an action completed or a capability is definitely ready.

- no repair step is needed
- the copy can move straight into the next normal action
- do not use this just because the user still has a fallback path

Examples:

- `Saved to account`
- `System check complete.`
- `AI sorting on`

### `info`

Use when the state is calm, intentional, or limited in a non-blocking way.

- the route still works as designed
- the user may want context, but not an urgent repair step
- optional-disabled, local-only, and not-configured-by-choice states usually belong here

Examples:

- `Saved on this device only`
- `Google Calendar is not configured; planning remains local-only.`
- `Capture still works and falls back to on-device sorting.`

### `warning`

Use when the route is degraded or partially unavailable, but the user still has a safe next move.

- say what is affected
- say what still works
- say the next repair or setup step without dramatizing it
- do not present this like a hard stop

Examples:

- `Account data is partially unavailable. Local state is still available.`
- `Not saved`
- `Needs setup`

### `danger`

Use when the route is blocked, the last action failed, or proceeding would be misleading or unsafe.

- the user cannot trust the normal path until something is fixed
- include the repair step or the explicit reason the action is stopped
- reserve this for real breakage or blocked trust, not ordinary friction

Examples:

- `Save failed`
- `Health checks could not load`
- `Needs attention`

## Non-severities

These are important, but they are not severity levels:

- approval-gated or external-write messaging
- loading or checking states
- developer or provider detail
- route identity copy

Keep those concerns separate from severity so tests and copy do not collapse everything into "error" language.

## Current primitive mapping

LifeOS does not need a broad component rewrite for this rule. Use the canonical severity intent, then map into the current primitives deliberately:

- `success` -> `success`
- `info` -> `secondary` or an intentionally quiet support surface
- `warning` -> `warning`
- `danger` -> `destructive`

If a route needs `info` semantics, do not force it into `warning` just because the component API lacks a literal `info` variant.

## Copy contract

For degraded or blocked states, the default message should answer three things in plain language:

1. What happened?
2. What still works?
3. What should the user do next?

Avoid shame, blame, stack jargon, or fake certainty.

## Route anchors

- `Home`: degraded account-data states are usually `warning`, not `danger`, when the launchpad still works locally.
- `Capture`: raw save succeeded but sorting failed is `warning` plus safety truth; raw save failure is `danger`.
- `Planning`: local-first planning with calendar unavailable is usually `warning` or `info`, depending on whether anything actually failed right now.
- `Health`: optional-disabled or local-only rows are `info`; broken auth, failed saving, or failed checks are `danger`.

## Test implications

- Recoverable degraded states should not be described or styled like hard failures.
- Danger tests should be reserved for blocked or failed trust.
- If a route still has a safe next move, start by proving `info` or `warning` before reaching for `danger`.
