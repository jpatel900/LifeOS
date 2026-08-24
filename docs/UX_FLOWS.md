# UX_FLOWS.md

Status: Authority UX contract for current workflow behavior
Purpose: Define the moments shell, surface semantics (home, overlays, sheets), workflow-state expectations, and user-facing behavior rules
Read when: Changing or reviewing workflow UX behavior
Do not use for: Active implementation queue, shipped change log, or historical proof by itself
Superseded by: n/a

Evolution note: V1 is the shipped UX baseline. Navigation follows the moments architecture (ADR 0003): one Today home, three moments, work in overlay sheets. Stage labels below express dependency and risk order under ADR 0005; they do not block owner-ratified, data-independent foundations. Personalization, proactive interruption, autonomy, and external-write behavior still require their relevant evidence and approval gates.

# UX Flows — Area-Scoped Personal Workflow Cockpit

## 1. UX Principles

The app should feel like a low-friction cockpit, not a bureaucracy.

Principles:

1. One obvious next action.
2. Fewer choices during execution than during planning.
3. Make time visible.
4. Make uncertainty visible.
5. Separate capture, triage, planning, execution, and review.
6. Never punish missed blocks with shame-language.
7. Every AI suggestion must be editable.
8. External writes require explicit approval.
9. Area context should be visible everywhere.
10. The system must help the user recover after disruption.
11. Planning outputs should prevent planning theatre: show the next action, timebox, confidence, known unknowns, review trigger, and what not to do yet instead of decorative roadmaps.

Principle 5 separates concerns, not routes: capture, triage, planning,
execution, and review each get their own surface, but those surfaces are
overlays on one home rather than separate destinations (ADR 0003).

## 2. Primary Navigation

**One shell, three moments (ADR 0003).** The Today home (`/`) is the only
cockpit surface. The day is organized into three moments — Start, Flow,
Close — switched by tabs, keys `1`/`2`/`3`, and the URL
(`/?moment=start|flow|close`). An explicit `?moment=` always wins over the
stored preference and clock heuristic used when the URL is silent.

**Work happens in overlay sheets on the home,** not on separate routes:
capture, Triage, Plan, Review, Health, All areas. Sheets compose with
moments (for example `?sheet=plan&moment=start`), and deep links render the
right surface at first paint.

**URL truth.** Every in-app state change is visible in the URL. Back and
Forward step moments and sheets only. Refresh, direct-URL entry, and
fresh-context reproduction all agree. The pinned proof lives in
`apps/web/tests/e2e/nav-truth.spec.ts` (C2 Target Card 2), which also pins
that any surface is reachable in at most two interactions from home.

**Retired stage routes.** The legacy stage routes (`/capture`, `/triage`,
`/plan`, `/execute`, `/review`, `/health`, `/calendar`, `/areas`, `/today`)
survive only as redirect shims behind the #590 rollback flag
(`NEXT_PUBLIC_MOMENTS_HOME=false`). They are not user paths.

### Stage 1 slice status

Slices S7 (win records) and S8 (weekly + monthly rollups) have shipped and
appear below as current behavior in their flows. Slice S3 (parse
`person_mentions`) shipped; its approval UI (S1) and the operator profile /
Home brief panel (S2, FR-019) remain targets. Table authority for all slice
statuses is `docs/DATA_MODEL.md`.

### Surface map

| Surface          | How it is reached                                        | URL                               |
| ---------------- | -------------------------------------------------------- | --------------------------------- |
| Today home       | Tabs, keys `1`/`2`/`3`, or bottom navigator (mobile)     | `/?moment=start\|flow\|close`     |
| Area selection   | Area switcher on the home                                | `?area=<slug>` (`all` = everyone) |
| Capture overlay  | Key `c` or the Capture button, from any moment           | `?capture=1`                      |
| Triage sheet     | Pipeline rail stage node in Start                        | `?sheet=triage`                   |
| Plan sheet       | Pipeline rail stage node in Start                        | `?sheet=plan`                     |
| Review sheet     | Pipeline rail stage node in Start                        | `?sheet=review`                   |
| Health sheet     | Side rail (Start, desktop) or More → command palette     | `?sheet=health`                   |
| All areas sheet  | Side rail (Start, desktop) or More → command palette     | `?sheet=areas`                    |
| Command palette  | More trigger (mobile bottom navigator)                   | Transient `?palette=1`, scrubbed  |
| Settings — Areas | Settings link (desktop masthead or mobile bottom nav)    | `/settings/areas`                 |
| Sign-in door     | Automatic redirect when signed out (Supabase configured) | `/login`                          |

Notes: `/settings/areas` is the one settings destination (areas, policies,
integrations) and requires sign-in — signed-out users land on `/login` with
a calm note. In demo mode (no Supabase env) there are no accounts: the
DemoModeBanner says so honestly and `/login` explains accounts are not set
up. `?moment=` and `?sheet=` compose; the capture overlay composes with
sheets.

### Future Operating-View Containment

Future project/task operating views should usually live inside existing
Planning, Review, or Health surfaces, or as secondary detail surfaces that
support those workflows.

Use these defaults unless a reviewed product decision says otherwise:

- project cockpit -> detail surface inside the relevant moment or sheet, not a new primary nav item
- by-project, by-area, stuck/waiting, people follow-up, archive, and priority/urgency views -> tabs, filters, disclosures, or detail surfaces inside the relevant workflow surface
- top-level navigation expansion beyond the three moments and their sheets -> explicit product approval plus requirements update first

The goal is to add operating clarity without turning LifeOS into a cluttered multi-dashboard app.

### Stage 1 target: Home brief panel (FR-019)

The Today home gains a read-only brief panel (blocks, focus items, aging
items, one stale project, recovery nudge) issuing zero mutations. It stays
within the read-only spirit of the home: the panel informs the moments, it
does not become a full-screen dashboard ahead of basic use (section 14
anti-patterns). Placement must respect whatever "mobile surface budget
doctrine" the product intends to define; that doctrine does not yet exist
in this doc or `AGENTS.md` (flagged in the PR as a dangling referent, not
resolved here).

## 3. Flow 1 — First-Time Setup

### Goal

Create enough structure to use the system without over-onboarding.

### Steps

1. User signs in (with Supabase configured; see the demo-mode note under Surface map).
2. App creates default areas:
   - Main Job
   - Personal
   - Volunteer Work
   - Side Project
3. User edits names/colors/icons or skips.
4. User sets basic global preferences:
   - normal wake/sleep window
   - preferred work window
   - default session length
   - strictness of calendar approval
5. User optionally connects Google Calendar.
6. App lands on the Today home (`/`); Capture is one keystroke away (`c` or
   the Capture button) and Areas live under Settings (`/settings/areas`).

### Acceptance Criteria

- Setup can be completed in under 5 minutes.
- User can skip Google Calendar and still use local proposals.
- User can change areas later.
- No AI call is required for initial setup.

## 4. Flow 2 — Quick Capture to Task

### Goal

Convert a simple thought into a task.

### Steps

1. User opens Capture (key `c` from anywhere, or the Capture button).
2. User types: "Follow up with Alex about event sponsorship."
3. User optionally selects "Volunteer Work."
4. User clicks "Save and organize."
5. System saves the raw capture first, then creates local draft suggestions.
6. User reviews the current item in the Triage sheet and accepts the task draft.
7. Task appears as accepted work that can be planned.

### UI Requirements

- Show raw capture.
- Show save mode and current area truthfully.
- Show draft suggestion(s).
- Show inferred area and confidence when AI sorting is involved.
- Provide Accept / Edit / Reject.

### Acceptance Criteria

- User can go from text to accepted task in under 30 seconds.
- Raw capture remains recoverable if parsing fails.
- No calendar proposal is forced.

### Constraint layer: capture containment (FR-026)

During the parse wait the UI holds the user in context — the raw text stays visible and a one-line "return hook" field (what you go back to afterward) is visible and editable. No new capture may begin until this one resolves; parse never goes fire-and-forget (past the latency budget the surface offers mock parse / save-raw synchronously instead). On resolve, the flow ends with "back to: <hook>". This is deliberately counter to the standard submit-and-wander async pattern; implementers must not normalize it.

### Daily-driver floor: offline raw-save path (FR-027)

FR-026 containment governs the online, awaiting-parse path above. A distinct entry path exists for when the user is offline or chooses "save raw": the capture is written to a device-local queue immediately and the interaction ends synchronously as saved-raw — no spinner, no parse wait, no fire-and-forget pending state (the same anti-async doctrine as FR-026, applied to a path that never waits on a parse at all). The queue syncs to `capture_items` automatically on reconnect, idempotently (via `client_capture_id`), and parse happens later at triage, not at sync. The two paths never overlap: online-parse ⇒ FR-026 containment; save-raw/offline ⇒ FR-027 queue; never both waiting at once. Raw capture surviving the device going offline is a strengthening of this flow's existing "raw capture remains recoverable if parsing fails" acceptance criterion, not a new guarantee.

## 5. Flow 3 — Ambiguous Capture to Sense-Making

### Goal

Turn a vague large task into a first workable map.

### Example Input

"Need to get my volunteer ops system under control before the next event. Too many loose ends."

### Steps

1. User submits messy input.
2. System detects ambiguity.
3. System suggests Sense-Making Mode.
4. User accepts.
5. System outputs:
   - likely objective
   - workstreams
   - knowns/unknowns
   - assumptions
   - constraints
   - risks
   - first 30-60 minute move
   - what not to do yet
6. User converts first move into task.
7. Remaining unknowns become discovery questions.

### Acceptance Criteria

- System does not create a fake full roadmap.
- System shows uncertainty explicitly.
- First move is reversible and time-boxed.
- Near-term work is concrete enough to start; later-wave work stays rough until discovery improves confidence.
- User can convert only selected items into tasks.

## 6. Flow 4 — Triage

### Goal

Resolve uncertain AI outputs before they pollute the system.

### Trigger Conditions

- low area confidence
- low task/project confidence
- too many generated tasks
- missing objective
- conflicting due dates
- ambiguous priority
- user requests review

### Steps

1. User opens the Triage sheet (pipeline rail in Start, or `/?sheet=triage`).
2. One current item is primary and the rest wait in an explicit next-up queue.
3. User chooses:
   - accept
   - edit
   - reject
   - split
   - merge
   - reassign area
   - defer
4. System logs corrections.

### Acceptance Criteria

- Triage does not become a permanent backlog.
- User can bulk reject low-value drafts.
- Corrections are logged per area.
- Accepted items become real objects.

### Stage 1 target: person-link approval step (slice S1)

When a capture's parse result includes a person mention (FR-017), Triage gains a person-link approval step alongside the existing accept/edit/reject/split/merge/reassign/defer choices: accept an existing matched person, create a new person record, or reject to a plain task (raw capture preserved). No person record is created or linked without this explicit approval (NS-INV-4). The parse half already ships: parse results carry `person_mentions` (slice S3, `docs/DATA_MODEL.md`); the people table and this approval step do not exist yet.

## 7. Flow 5 — Task to Local Time-Block Proposal

### Goal

Suggest when to do a task without writing to calendar yet.

### Steps

1. User selects a task.
2. User clicks "Suggest a time."
3. System fetches:
   - area policy
   - task duration range
   - time preferences
   - calendar free/busy if connected
4. System creates 1-3 proposals.
5. User reviews the local suggestion, adjusts it, plans it locally, or checks calendar availability.

### Acceptance Criteria

- Suggestions and planned blocks remain local until the user explicitly asks for a Google write.
- Rationale is shown.
- Conflict flag is visible.
- User can edit start/end before approval.

## 8. Flow 6 — Approval-Gated Calendar Write

### Goal

Write approved block to Google Calendar safely.

### Steps

1. User optionally checks calendar availability, then clicks "Create Google Calendar event."
2. App shows final confirmation:
   - title
   - area
   - date/time
   - calendar
   - conflict warning if any
   - first-write warning when relevant
3. User confirms.
4. Next.js server code (Route Handler or Server Action) writes the event via the calendar adapter.
5. App stores Google event ID.
6. App creates audit log.

Every write lands in `external_write_events`; free/busy informs proposals but never authorizes a write. Cancelling app-owned events ships; updating or rescheduling an existing Google event is not built.

### Acceptance Criteria

- No calendar write occurs without final user action.
- Failed writes are visible and recoverable.
- Duplicate writes are prevented by proposal status/event ID check.
- User can use local-only mode if calendar is disconnected.

## 9. Flow 7 — Execute Current Block

### Goal

Help the user start and finish a work session.

### Steps

1. User opens the current scheduled block — the Flow moment shows exactly one current block.
2. The Flow moment shows:
   - current task
   - area
   - first tiny step
   - focus state and timing truth
   - definition of done
3. User starts a focus session.
4. During work, user can:
   - pause
   - mark distracted
   - capture side thought
   - mark stuck
5. At end, user records:
   - completed/partial/blocked/skipped
   - actual duration
   - distraction estimate
   - productivity rating
   - notes

### Acceptance Criteria

- Screen shows only one primary task.
- Quick capture does not navigate away (it opens the overlay over the current moment).
- Marking stuck can generate a smaller next step.
- End-session data updates logs.
- Persisted execution does not pretend a live timer is authoritative when it is not.

### Constraint layer: DoD-cap state machine (FR-025)

When the block's time cap arrives and the definition of done is unmet, the surface forces a binary choice — cut scope (edit the DoD down to what is true and close done) or defer (explicit re-block/backlog with a one-line carry note). Silently continuing is not a reachable state. Copy stays matter-of-fact: caps are how work ends, not a failure.

## 10. Flow 8 — Missed Block Recovery

### Goal

Recover from disruption without collapsing the plan.

### Steps

1. User marks a block missed.
2. App asks:
   - reschedule
   - drop
   - defer
   - leave unscheduled
3. If reschedule:
   - system proposes new local slots
   - flags conflicts
   - user approves/edit/rejects
4. Approved external changes require confirmation.

### Acceptance Criteria

- Missed block is not treated as failure.
- Reschedule creates proposals, not automatic writes.
- User can drop or defer without penalty language.
- Missed block contributes to learning logs.

### Daily-driver floor: re-entry ritual (FR-028)

This flow's "a missed block is not a failure" doctrine extends, batched, to a multi-day absence rather than forking into a separate recovery flow. On first open after an absence of >= N days (seed N = 3, settings-configurable), the app runs a deterministic, rule-based return ritual in place of the normal moments home instead of surfacing missed blocks one at a time: scheduled blocks whose time fully passed during the absence are auto-deferred to backlog by a deterministic rule (no AI) and every deferral is enumerated in a single "while you were out" summary (counts + the deferral list + the one stalest thing) — a reversible, non-AI, enumerated status transition, not a silent write. The ritual then surfaces exactly one recovery proposal as an L1 proposal (accept/edit/dismiss, never auto-started); on accept it re-enters through the normal activation path with the same WIP and launch-sequence gating as any other commitment. Zero red on screen during the ritual — no overdue badges, no failure language, no penalty framing — and the absence, deferrals, and recovery resolution are recorded (`re_entry.v1`) for the learning loop.

## 11. Flow 9 — Daily Review

### Goal

Close today and reduce tomorrow's chaos.

### Steps

1. User opens the Review sheet (pipeline rail in Start, or `/?sheet=review`).
2. The sheet shows:
   - completed
   - missed
   - still open
   - blocked
   - captured but unresolved
3. User chooses:
   - move to tomorrow
   - drop
   - reschedule
   - keep unscheduled
   - convert capture to task
4. User rates day optionally.

The Close moment is the day-scoped companion: a short, verdict-bearing day
close with an optional check-in. The Review sheet holds standing open work;
Close holds today.

### Acceptance Criteria

- Can complete in under 5 minutes.
- App suggests but does not force cleanup.
- Review generates no external writes without approval.

### Aging section (slice S4 — shipped)

The Review sheet carries an aging section showing waiting-on and commitment items past the aging threshold (FR-017; default 3 days, per-area override via `global_defaults`); the Health sheet surfaces the same aging signals. Aging is a display/surfacing concern only — rule-based, not AI-invented — and adds no new mutation path.

## 12. Flow 10 — Weekly Review

### Goal

Update the system from reality.

### Steps

1. User opens Weekly Review.
2. App groups by area.
3. App shows:
   - backlog drift
   - missed-block patterns
   - duration estimate errors
   - priority override patterns
   - accepted/rejected suggestions
4. App proposes:
   - priority profile updates
   - time-window updates
   - duration profile updates
   - cleanup actions
5. User approves/rejects suggestions.

Two pieces of this flow ship today, both in the Close moment: win
confirmation and rollup approval (below). They persist durably — wins,
reviews, plans, drafts, and rollups are journalled to the device before any
network call and replayed to the account, and the copy around them says
truthfully whether something is "saved on this device" or "saved to your
account".

### Win harvest (slice S7 — shipped)

The Close moment offers win candidates drawn from completions; only
user-confirmed wins persist as `win_records` (FR-020). Declining a
candidate discards it; nothing is written silently.

### Rollup approval (slice S8 — shipped)

An AI-drafted weekly rollup per area (strict schema) is shown in the Close
moment and persists as a `rollup_summaries` row only on explicit user
approval (FR-020, NS-INV-4). Monthly rollups compose approved weeks and are
surfaced the same way at the monthly cadence.

## 13. Flow 11 — Health Dashboard

### Goal

Show whether the system itself is working.

### Steps

1. User opens the Health sheet (side rail in Start, or More → command palette; `/?sheet=health` deep-links).
2. The sheet displays:
   - system status
   - area statuses
   - subsystem statuses
3. User clicks an incident.
4. App shows:
   - what is wrong
   - why it matters
   - how to fix it
   - whether it blocks usage

### Acceptance Criteria

- Health scoring is deterministic.
- AI explanations are clearly secondary.
- Auth/calendar/AI/database failures are separate.
- Repair guide is actionable.

## 14. UX Anti-Patterns to Avoid

Avoid:

- giant task trees
- fake Gantt charts
- overlong review forms
- constant notifications
- shame language
- auto-scheduling everything
- hidden AI decisions
- too many AI-generated suggestions
- dashboards with no next action
- full-screen analytics before basic use works
- fire-and-forget capture parse (submit → spinner → notify-later; see FR-026 — the wait must hold context, never release the user to wander)

## 15. Core UI Components

- Moment tabs (Start / Flow / Close)
- Area selector
- Confidence badge
- Draft card
- Triage card
- First Move card
- Discovery Question card
- Time-block proposal card
- Conflict badge
- Execution focus-state card
- Capture overlay
- Review checklist
- Health incident card
- Policy suggestion card

## 16. Copy Guidelines

Use direct, non-judgmental language.

Good:

- "This block was missed. What should happen next?"
- "This task may be too vague to schedule."
- "First useful move: clarify the owner."
- "Your estimate is lower than similar past tasks."
- "Saved on this device — will send to your account when you're online."
- "Saved to your account."

Avoid:

- "You failed to complete this."
- "You are behind."
- "You should have done this."
- "Productivity score: bad."
- Claiming account persistence when data is only on the device (and vice versa).

## Reference Links

These documents are intentionally grounded in stable platform capabilities, not hardcoded vendor-specific hype.

- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI Responses API migration / `store: false`: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Google Calendar Freebusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy
- Google Calendar Events Insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Vercel Cron Jobs / Hobby limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Anthropic Building Effective Agents: https://www.anthropic.com/research/building-effective-agents
