# UI Information Hierarchy Doctrine

Status: Active Pass 7 doctrine for UI content placement
Purpose: Define where user action truth, safety truth, diagnostic truth, and developer truth belong across LifeOS routes
Read when: Changing copy, degraded states, disclosures, details placement, first-viewport hierarchy, or Health routing
Do not use for: Shipped product truth by itself or as permission to hide safety-critical information
Superseded by: n/a; amend this doctrine rather than creating a competing hierarchy rule set

## The four truths

### 1. User action truth

What the user can do next, what just happened, and what decision or task is currently active.

This belongs:

- in the primary route surface
- above diagnostics and support detail
- in plain language

Examples:

- `Save thought`
- `Review current item`
- `Create Google Calendar event`
- `Start focus session`

### 2. Safety truth

What is real versus local, what writes externally, what requires approval, what failed, and what still works.

This belongs:

- near the action it qualifies
- visible before a risky or external action
- concise unless the route is blocked

Examples:

- saved to account versus saved on this device only
- Google Calendar write is approval-gated
- parser failed but raw capture was still saved

### 3. Diagnostic truth

Why the system is degraded, which subsystem is affected, what was checked, and what the next repair step is.

This belongs:

- in details or secondary support surfaces by default
- in `Health` as the primary diagnostic home
- above the fold only when the route is blocked or the user cannot trust the main action without it

Examples:

- data source unavailable
- health check timeout
- calendar conflict check disconnected

### 4. Developer truth

Internal identifiers, provider wiring detail, implementation terminology, stack-specific error detail, and low-level debugging clues.

This belongs:

- in explicit details only
- in `Health` or admin surfaces when truly useful
- out of primary workflow surfaces unless a human operator explicitly needs it to recover

Examples:

- provider names
- internal status codes
- schema or route handler jargon
- raw technical diagnostics

## Placement rules

1. User action truth wins the first scan.
2. Safety truth must be visible before the user can misread the action or outcome.
3. Diagnostic truth should explain blocked or degraded states without beating the main task when recovery is still possible.
4. Developer truth is never primary workflow copy.
5. `Health` is the diagnostic home. Do not turn every route into a mini-health dashboard.

## Promotion rules

- Promote safety truth upward when the user might otherwise misunderstand what saved, synced, wrote externally, or failed.
- Promote diagnostic truth upward only when the main task is blocked, unreliable, or unsafe without that context.
- Do not promote developer truth upward just because it is available.

## Route implications

- `Home`: launchpad first, degraded-state explanation second, deep diagnostics elsewhere.
- `Capture`: raw input and save action first, save or parser safety truth near the action, metrics and history later.
- `Triage`: one current decision first, queue context and system detail later.
- `Planning`: local planning flow first, external approval truth near the external action, provider detail later.
- `Execute`: one mission and one next move first, session detail and system context later.
- `Review`: carry-forward decisions first, summaries and history later.
- `Health`: diagnostic truth first by design, but still prefer repair-first wording over raw subsystem noise.
- `Areas`: ownership and admin tasks first, secondary diagnostics later.

## Fast decision test

Before putting content in the primary route surface, ask:

1. Does this help the user act now?
2. Does this prevent a safety misunderstanding?
3. Is the route blocked without this information?
4. If not, should this move into details or Health instead?
