# UX_FLOWS.md

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

## 2. Primary Navigation

**Primary workflow screens (six, per NFR-005):**

- Capture
- Triage
- Calendar / Planning
- Execute
- Review
- Health

**Secondary / admin:** Settings (areas, policies, integrations) — supports the app but is not one of the six primary workflow screens.

Suggested route map:

```text
/capture
/triage
/calendar
/execute/:blockId
/review/daily
/review/weekly
/health
/settings/areas
/settings/policies
/settings/integrations
```

## 3. Flow 1 — First-Time Setup

### Goal

Create enough structure to use the system without over-onboarding.

### Steps

1. User signs in.
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
6. App lands on Capture screen.

### Acceptance Criteria

- Setup can be completed in under 5 minutes.
- User can skip Google Calendar and still use local proposals.
- User can change areas later.
- No AI call is required for initial setup.

## 4. Flow 2 — Quick Capture to Task

### Goal

Convert a simple thought into a task.

### Steps

1. User opens Capture.
2. User types: "Follow up with Alex about event sponsorship."
3. User optionally selects "Volunteer Work."
4. User clicks "Structure."
5. System creates task draft.
6. User accepts.
7. Task appears in area task list.

### UI Requirements

- Show raw capture.
- Show task draft.
- Show inferred area and confidence.
- Provide Accept / Edit / Reject.

### Acceptance Criteria

- User can go from text to accepted task in under 30 seconds.
- Raw capture remains recoverable if parsing fails.
- No calendar proposal is forced.

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

1. User opens Triage.
2. Items are grouped by issue:
   - area uncertain
   - task/project uncertain
   - scheduling unclear
   - missing info
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

- Triage screen does not become a permanent backlog.
- User can bulk reject low-value drafts.
- Corrections are logged per area.
- Accepted items become real objects.

## 7. Flow 5 — Task to Local Time-Block Proposal

### Goal

Suggest when to do a task without writing to calendar yet.

### Steps

1. User selects a task.
2. User clicks "Propose time."
3. System fetches:
   - area policy
   - task duration range
   - time preferences
   - calendar free/busy if connected
4. System creates 1-3 proposals.
5. User approves, edits, rejects, or asks for alternatives.

### Acceptance Criteria

- Proposals remain local until approved.
- Rationale is shown.
- Conflict flag is visible.
- User can edit start/end before approval.

## 8. Flow 6 — Approval-Gated Calendar Write

### Goal

Write approved block to Google Calendar safely.

### Steps

1. User clicks "Approve and add to calendar."
2. App shows final confirmation:
   - title
   - area
   - date/time
   - calendar
   - conflict warning if any
3. User confirms.
4. Next.js server code (Route Handler or Server Action) writes the event via the calendar adapter.
5. App stores Google event ID.
6. App creates audit log.

### Acceptance Criteria

- No calendar write occurs without final user action.
- Failed writes are visible and recoverable.
- Duplicate writes are prevented by proposal status/event ID check.
- User can use local-only mode if calendar is disconnected.

## 9. Flow 7 — Execute Current Block

### Goal

Help the user start and finish a work session.

### Steps

1. User opens current scheduled block.
2. Execute screen shows:
   - current task
   - area
   - first tiny step
   - timer
   - definition of done
3. User starts timer.
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
- Quick capture does not navigate away.
- Marking stuck can generate a smaller next step.
- End-session data updates logs.

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

## 11. Flow 9 — Daily Review

### Goal

Close today and reduce tomorrow's chaos.

### Steps

1. User opens Daily Review.
2. App shows:
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

### Acceptance Criteria

- Can complete in under 5 minutes.
- App suggests but does not force cleanup.
- Review generates no external writes without approval.

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

### Acceptance Criteria

- User sees declared vs observed behavior.
- Core policy changes require approval.
- User can apply suggestions by area only.
- Review does not create too many suggestions.

## 13. Flow 11 — Health Dashboard

### Goal

Show whether the system itself is working.

### Steps

1. User opens Health.
2. App displays:
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

## 15. Core UI Components

- Area selector
- Confidence badge
- Draft card
- Triage card
- First Move card
- Discovery Question card
- Time-block proposal card
- Conflict badge
- Execution timer
- Quick capture sidebar
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

Avoid:

- "You failed to complete this."
- "You are behind."
- "You should have done this."
- "Productivity score: bad."

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
