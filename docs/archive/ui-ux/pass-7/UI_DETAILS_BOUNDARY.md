# UI Details Boundary

Status: Active Pass 7 shared rule for system detail versus developer detail
Purpose: Standardize what belongs in route details, what belongs in developer-only detail, and where each level should live
Read when: Adding disclosures, staging diagnostics, exposing technical identifiers, or deciding whether a detail belongs on a workflow route
Do not use for: Severity choice, route-first hierarchy by itself, or permission to expose raw internal detail broadly
Superseded by: n/a; amend this file rather than creating a competing detail-boundary rule

## Two detail levels

### System details

System details help the user understand current behavior or recover safely without reading raw implementation jargon.

Examples:

- save mode
- local-only versus account-backed state
- whether a subsystem is connected
- which fallback path is active

System details may appear in:

- route disclosures
- Health
- admin surfaces

### Developer details

Developer details expose internal identifiers, provider terms, low-level implementation state, or raw debugging hints.

Examples:

- provider ids
- persistence ids
- stack or adapter terminology
- raw status codes

Developer details should appear only in:

- explicit developer disclosures
- `Health`
- admin or setup surfaces when truly useful

They should not dominate primary workflow surfaces.

## Primitive rule

Use `DiagnosticsDisclosure` as the shared disclosure seam:

- default `detailLevel` is `system`
- use `detailLevel="developer"` only when the operator may genuinely need internal detail
- default disclosure titles should stay `System details` and `Developer details`

Do not create route-local disclosure patterns that bypass this distinction without a strong reason.

## Placement rules

- If the detail explains what still works or how to recover safely, it is usually `system`.
- If the detail mainly helps debug implementation state, it is `developer`.
- `Health` may contain both levels, but developer detail should stay inside an explicit lower-level disclosure.
- Workflow routes should prefer system detail and push deeper developer detail toward `Health`.

## Fast decision test

Before adding detail to a workflow route, ask:

1. Does this help the user recover or act safely right now?
2. Can the same truth be stated without internal jargon?
3. If not, should this move into a developer disclosure or Health instead?
