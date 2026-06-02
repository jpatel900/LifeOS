# Interaction planning decisions for issues #132, #134, #138, and #139

## Issue #132: Undo and recovery affordances

### Decision

Do not add a generic undo system in V1. Use four explicit patterns instead:

1. immediate local undo where state is still browser-local and reversible
2. explicit reverse actions where the data layer already has a true inverse
3. recovery guidance where the right move is a follow-up, not an undo
4. confirmation-first flows where reversal is unsafe or ambiguous

### Action classification

#### Capture

- `Save thought`
  - no immediate undo claim
  - recovery pattern: route the user to Triage or Review and allow later deletion only if a real delete/archive path exists
- `Save and organize`
  - no fake undo
  - recovery pattern: edit/reject the resulting draft in Triage

#### Triage

- `Edit`
  - reversible by editing again, not by a global undo
- `Accept`
  - recovery is downstream correction in Planning/Review, not a toast-level undo
- `Reject`
  - should use confirmation if destructive persistence is ever added
- note-only actions
  - browser-local note affordances are the best candidates for immediate local undo if they stay session-local

#### Planning

- proposal adjustments like `move later`, `shorten`, `extend`
  - local undo is acceptable if the previous proposal state is still in client memory
- `Plan this time`
  - do not label as undo; use explicit remove/reject/reopen behavior instead
- `Check calendar`
  - no undo needed; it is advisory
- `Create Google Calendar event`
  - not casually undoable
  - treat as external-write recovery work, not as undo

#### Execute

- `Start`, `pause`, `resume`
  - not good candidates for generic undo because they represent time already spent
- terminal outcomes like `completed`, `stuck`, `distracted`, `missed`
  - use recovery-next-step guidance instead of undo

#### Review

- `Create daily review`
  - if persisted, do not promise undo unless a true delete/archive path is added
  - if local-only, local removal can be acceptable later as an explicit action

#### Areas

- `Create area`
  - reversible only through an explicit remove path
- `Remove area`
  - must stay confirmation-first
- `Accent change`
  - can support immediate local revert because the prior accent value is already known

#### Local reset

- never present as undoable
- keep confirmation-first because it is destructive and multi-surface

### Follow-up split

- low-risk local undo candidates
  - area accent revert
  - browser-local note-only actions
  - browser-local proposal adjustment revert
- medium-risk recovery/confirmation work
  - persisted review removal
  - persisted triage reversal
  - planning reopen/remove semantics
- high-risk explicit non-undo surfaces
  - Google Calendar event creation remains approval-gated and non-trivial to reverse

## Issue #134: Command palette and shortcuts

### Decision

Do not add a command palette yet.

### Why

- The label map, selected-area semantics, and settings IA are still being stabilized.
- A command palette before that stabilization would encode moving targets and make the product feel more clever than useful.
- The repo already has one safe shortcut: `Ctrl/Cmd + Enter` on Capture.

### Recommended V1 shortcut plan

- keep the existing `Ctrl/Cmd + Enter` capture save shortcut
- add a lightweight `?` keyboard-help surface first, before any broad shortcut expansion
- only after that, consider route-local shortcuts with strict non-input guards

### Recommended future shortcut slices

#### Stage 1: documentation/help only

- `?`
  - open keyboard help

#### Stage 2: route-local shortcuts

- `Capture`
  - preserve `Ctrl/Cmd + Enter`
- `Triage`
  - consider shortcuts for accept/edit/reject on the current visible item only
- `Planning`
  - consider shortcuts only for the currently focused proposal card
- `Execute`
  - consider start/pause/end only when no text input is active
- `Review`
  - consider a shortcut for `Create daily review`

### Hard rules

- Ignore shortcuts while text inputs, textareas, or editable controls are active unless the shortcut is explicitly tied to that field.
- Do not make Google Calendar external-write actions available via a bare shortcut.
- Do not add route-navigation shortcuts until the label map is formally settled in docs.

## Issue #138: Manual time editing before acceptance

### Decision

Add manual proposal editing later as an inline proposal-card edit mode, not as a separate planner surface.

### Exact fields

- `Date`
- `Start time`
- `Duration (minutes)`
- derived read-only `Ends at` preview

This is better than separate start-and-end editing for V1 because it avoids contradictory inputs while still giving exact control.

### Validation rules

- duration must be positive
- end time must remain after start time
- same-day only for V1
- if the chosen time is already in the past for today, block save with plain-language guidance instead of silently accepting it

### Conflict-check behavior after edit

- any existing Google Calendar conflict result becomes stale after a manual edit
- persisted proposals should return to a `Calendar not checked` state after saving the new local time
- local-only proposals have no Google conflict state and should stay plainly local

### Local vs persisted behavior

- local/mock mode
  - edits stay browser-local
  - no Google check/write affordance changes
- persisted mode
  - reuse the existing proposal edit path
  - do not create or update Google Calendar events during editing
  - keep approval-gated event creation separate

### Tests needed before implementation

- invalid range rejection
- past-time rejection copy
- local edit success
- persisted edit success
- conflict-check state reset to stale/not-checked after edit
- explicit proof that editing never creates a Google Calendar event

## Issue #139: Mobile bottom navigation

### Decision

Do not add bottom navigation in V1 yet. Re-evaluate later.

### Why

- The current mobile problem is density and clarity, not route discoverability alone.
- Bottom nav now would duplicate the sticky header nav while the canonical label map is still settling.
- LifeOS also still has secondary/admin destinations (`Areas`, `Health`) that do not fit cleanly into a calm five-tab mobile pattern without adding a `More` bucket and extra navigation complexity.

### Recommended later trigger

Revisit bottom nav only after:

- the canonical label map is settled in docs
- selected-area semantics are clarified in runtime copy
- the remaining mobile smoke gaps across the primary routes are closed

### If reopened later

The best candidate pattern is:

- visible only at mobile breakpoints
- top candidates: `Today`, `Capture`, `Planning`, `Execute`, `Review`
- everything else stays in the existing header/secondary navigation
- no duplicate conflicting navigation landmarks

### Current recommendation

- keep investing in header density cleanup and route-level mobile ergonomics first
- treat bottom nav as a possible later optimization, not a current V1 requirement
