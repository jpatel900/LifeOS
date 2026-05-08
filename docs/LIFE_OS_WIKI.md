# Area-Scoped Personal Workflow Cockpit — Consolidated Wiki

## 0\. One-line definition

**A private AI-assisted workflow cockpit that turns messy audio/text input into structured action, stages time decisions for approval, learns separately across life areas, and monitors whether the system itself is still useful.**

Not “Jarvis.”
Not “AI runs my life.”
Not “a second brain with delusions of management.”

The correct frame is:

> \\\\\\\*\\\\\\\*AI as a clarity engine, proposal engine, and feedback engine — not a silent ruler.\\\\\\\*\\\\\\\*

\---

# 1\. Core thesis

Large, ambiguous tasks usually fail at the **sense-making** stage, not the execution stage.

The system exists to help with:

| Problem                                             | System Response                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| “I don’t know where to start.”                      | Generate the smallest useful next move.                                    |
| “I don’t know what this task contains.”             | Break messy input into tasks, projects, blockers, and unknowns.            |
| “I don’t know how long this will take.”             | Estimate ranges, not fake-precise numbers.                                 |
| “I don’t know what matters most.”                   | Score against explicit and learned priorities.                             |
| “I don’t know what I don’t know.”                   | Surface missing information and clarification questions.                   |
| “I plan, then reality ruins it.”                    | Use rolling-wave planning: detail the near term, keep later work flexible. |
| “I keep mixing work/personal/volunteer priorities.” | Scope everything by life area.                                             |

The deeper product idea:

> \\\\\\\*\\\\\\\*Turn ambiguity into motion without pretending uncertainty has disappeared.\\\\\\\*\\\\\\\*

\---

# 2\. Product name

## **Area-Scoped Personal Workflow Cockpit**

**Product type:** private, one-user, cloud-hosted, AI-assisted workflow system
**Primary mode:** user-triggered intelligence + approval-triggered external writes
**Core stack posture:** low-cost, simple, auditable, maintainable

\---

# 3\. Design principles

## 3.1 AI assists; it does not rule

AI may:

- parse
- classify
- summarize
- suggest
- score
- explain
- warn
- propose

AI should not silently:

- rewrite priorities
- mutate the calendar
- delete/archival decisions
- change hard scheduling rules
- expand permissions
- operate external systems

## 3.2 Clarity beats fake certainty

The system should use:

- confidence levels
- explicit assumptions
- reversible actions first
- ranges instead of exact estimates
- “what we know / what we do not know” separation

## 3.3 Area-specific learning beats global mush

Main job, personal life, volunteer work, health, and side projects do **not** behave the same.

So the system must learn separately by area.

## 3.4 Approval gates are non-negotiable

External writes — especially Google Calendar changes — must be staged first and approved before execution. Google Calendar’s API supports event creation and requires authorization, while the free/busy endpoint can be used to check availability before staging proposals. ([Google for Developers](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert?utm_source=chatgpt.com))

## 3.5 Use structured outputs, not vibes

Any AI output that mutates system state should follow a strict schema. OpenAI’s Structured Outputs are specifically meant to enforce schema adherence, and OpenAI recommends using them over plain JSON mode when possible. ([OpenAI Developers](https://developers.openai.com/api/docs/guides/structured-outputs?utm_source=chatgpt.com))

## 3.6 Keep agent architecture simple

Use predefined workflows and tool calls before building autonomous agent webs. Anthropic’s agent guidance explicitly recommends starting with the simplest solution and increasing complexity only when needed. ([Anthropic](https://www.anthropic.com/research/building-effective-agents?utm_source=chatgpt.com))

\---

# 4\. Product scope

## 4.1 This system is

- a private workflow cockpit
- an ambiguity-to-action engine
- a planning and scheduling assistant
- an execution launchpad
- a review and learning loop
- a health-monitoring system
- area-scoped and approval-first

## 4.2 This system is not

- a full autonomous life manager
- a computer-use/browser agent
- an email/message ingestion system
- a full conflict-solving scheduler
- a multi-user project-management platform
- a system that silently rewrites its own rules
- a broad web-browsing research agent

\---

# 5\. User problem model

The system is designed around these recurring failure modes:

| Failure Mode             | Product Response                                                          |
| ------------------------ | ------------------------------------------------------------------------- |
| Time blindness           | Visible schedules, timers, duration ranges, end-time awareness            |
| Task initiation friction | First tiny step, one-task execution screen, low-risk first move           |
| Overwhelm                | Capture → parse → triage instead of giant undifferentiated lists          |
| Working memory overload  | Externalize tasks, blockers, reminders, and “what is next”                |
| Poor transitions         | Missed-block handling, rescheduling suggestions, transition buffers later |
| Perfectionism            | Definition of done, time caps, “ship at useful enough” prompts            |
| Planning collapse        | Rolling-wave planning and review loops                                    |
| Cross-area contamination | Area-scoped priorities, policies, and learning                            |
| Maintenance drag         | Health dashboard and repair guides                                        |

\---

# 6\. Scope model

## 6.1 First-class object: `Area`

Area is not a loose label. It is a first-class scope object.

Examples:

- Main Job
- Personal
- Volunteer Work
- Side Project
- Family
- Health

## 6.2 Scope hierarchy

```text
Item override
→ Area-level policy / learning
→ Global default
```

## 6.3 Why this matters

Different areas may have different:

- priorities
- urgency patterns
- preferred time windows
- duration estimates
- acceptable interruption levels
- review cadence
- scheduling softness
- health thresholds

## 6.4 What should be area-scoped

Most operational and learning objects should carry `area\\\\\\\_id`.

| Object                  | Scope                   |
| ----------------------- | ----------------------- |
| Task                    | Area                    |
| Project                 | Area                    |
| Capture item            | Area or unresolved area |
| Time-block proposal     | Area                    |
| Calendar block          | Area                    |
| Review entry            | Area or global          |
| Priority profile        | Area + global fallback  |
| Time preference profile | Area + global fallback  |
| Duration profile        | Area + global fallback  |
| Productivity profile    | Area                    |
| Triage-learning profile | Area                    |
| Suggestion record       | Area                    |
| Override record         | Area                    |
| Health incident         | Area or system-wide     |
| Approval rule           | Global + area override  |

## 6.5 What should stay mostly global

- authentication/session
- AI provider config
- calendar connector token
- global defaults
- global health thresholds
- audit conventions
- core app settings

\---

# 7\. High-level architecture

```text
User
  ↓
Web App / Cockpit UI
  ↓
Application Backend
  ├─ Scope Resolver
  ├─ Workflow Engine
  ├─ Meta-Layer Engine
  ├─ Scheduling Suggestion Engine
  ├─ Health Engine
  ├─ Approval / Policy Engine
  └─ Audit / Logging
      ↓
      ├─ AI Provider
      ├─ Google Calendar API
      └─ Database/Auth
```

Recommended technical posture:

| Layer            | Recommendation                                           |
| ---------------- | -------------------------------------------------------- |
| Frontend         | Next.js web app                                          |
| Hosting          | Vercel Hobby for early personal use                      |
| Backend/Auth/DB  | Supabase                                                 |
| Server functions | Supabase Edge Functions                                  |
| AI               | OpenAI Responses API + Structured Outputs                |
| Calendar         | Google Calendar API                                      |
| Background jobs  | None by default; minimal Supabase Cron only if necessary |

Supabase Row Level Security can combine with Supabase Auth for end-to-end user security from browser to database, and Supabase Edge Functions are server-side TypeScript functions suitable for third-party integrations. ([Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com))

\---

# 8\. Primary screens

## 8.1 Capture Screen

**Purpose:** turn messy input into structured drafts.

Inputs:

- text dump
- audio dump
- optional manual area selection

System actions:

- transcribe audio if needed
- parse into structured drafts
- infer area
- assign confidence
- route ambiguous items to triage

Outputs:

- capture item
- task draft
- project draft
- blocker draft
- proposed time block
- clarification item

Core rule:

> Capture should reduce fog, not create a giant inbox swamp.

\---

## 8.2 Triage Screen

**Purpose:** resolve uncertainty before it contaminates the system.

Triage dimensions:

- area assignment
- task vs project
- priority
- due date
- blocker status
- scheduling intent
- missing information

User actions:

- accept
- edit
- reject
- split
- merge
- reassign area
- defer
- mark unclear

Learning impact:

- corrections feed the relevant area’s triage-learning model
- corrections should not blindly affect all areas

\---

## 8.3 Calendar / Planning Screen

**Purpose:** stage time-block decisions.

Views:

- day view
- week view
- area filter
- proposed vs confirmed blocks
- conflict flags
- missed-block actions

Actions:

- approve proposal
- edit proposal
- reject proposal
- mark missed
- reschedule
- mark productive
- mark distracted
- compare actual duration with suggested duration

Calendar behavior:

- create proposals locally
- check availability
- flag conflicts
- require approval before Google Calendar write

\---

## 8.4 Execute Screen

**Purpose:** reduce startup friction during a work block.

Elements:

- current area
- current task
- first tiny step
- timer
- pause button
- distracted button
- stuck button
- quick capture sidebar
- anti-perfectionism prompt
- session-end summary

Logged data:

- planned duration
- actual duration
- paused time
- distraction estimate
- productivity rating
- outcome
- task type
- area

Design rule:

> This screen should feel like a launchpad, not a cockpit full of buttons.

\---

## 8.5 Review Screen

**Purpose:** close loops and update reality.

Daily review:

- done
- missed
- moved
- dropped
- blocked
- surprising friction
- surprising ease

Weekly review:

- backlog health
- stale tasks
- missed blocks
- accepted/rejected suggestions
- priority drift
- time-window drift
- duration-estimation drift
- area-specific policy suggestions

Review should answer two questions:

1. How is the whole system doing?
2. How is each area doing?

\---

## 8.6 Health Screen

**Purpose:** make system degradation visible.

Views:

- system-wide health
- per-area health
- subsystem health
- meta-model health

Status badge:

- 🟢 healthy
- 🟡 attention needed
- 🔴 repair needed

Health screen should show:

- what is failing
- why it matters
- severity
- last successful check
- repair steps
- affected area/subsystem
- whether user action is required

\---

# 9\. Core workflows

## 9.1 Capture → Parse → Area Assign → Triage

```text
User dumps audio/text
→ system transcribes if needed
→ system parses into structured drafts
→ system infers likely area
→ high-confidence items are staged
→ unclear items go to triage
→ accepted items become tasks/projects/proposals
```

## 9.2 Task → Schedule Suggestion → Proposal

```text
Task exists in Area X
→ fetch Area X priorities
→ fetch Area X time preferences
→ fetch Area X duration priors
→ generate proposed blocks
→ check calendar availability
→ stage proposals
→ wait for user approval
```

## 9.3 Proposal → Approval → Calendar Write

```text
User reviews proposal
→ edits or accepts
→ approved proposal writes to Google Calendar
→ external write is logged
→ calendar block is stored locally
```

## 9.4 Execution → Measurement → Learning

```text
Block starts
→ show one task and first tiny step
→ run timer
→ collect pause/distraction/outcome data
→ update area-specific duration and productivity models
```

## 9.5 Missed Block → Reschedule Suggestion

```text
User marks block missed
→ system proposes replacement slots
→ conflicts are flagged
→ user chooses/edit proposal
→ approved change writes externally if needed
```

## 9.6 Review → Policy Suggestion

```text
Daily/weekly review runs
→ system summarizes behavior by area
→ compares declared preferences vs observed behavior
→ proposes policy updates
→ user approves/rejects core changes
```

\---

# 10\. Meta-layer

The meta-layer should be:

```text
self-observing
→ self-suggesting
→ selectively self-adjusting
→ never silently sovereign
```

## 10.1 Priority Meta-Workflow

Purpose:

- score incoming work against declared and learned priorities

Inputs:

- declared priorities
- user accept/reject choices
- what gets scheduled first
- what gets deferred repeatedly
- deadlines
- task type
- area

Outputs:

- priority score
- confidence
- rationale
- uncertainty flag
- suggested priority update

Hard rule:

> The system may suggest priority updates. It must not silently rewrite priorities.

\---

## 10.2 Time Preference Meta-Workflow

Purpose:

- learn when each area works best

Inputs:

- declared work windows
- sleep windows
- productive ratings
- missed-block data
- time-of-day outcomes
- task type

Outputs:

- preferred windows
- poor-fit windows
- scheduling suggestions
- proposed preference changes

Example:

| Area           | Possible Learned Pattern            |
| -------------- | ----------------------------------- |
| Main Job       | Deep work strongest 9:30 AM–1:00 PM |
| Volunteer Work | Coordination works better evenings  |
| Personal       | Errands fit late afternoon better   |

\---

## 10.3 Duration Meta-Workflow

Purpose:

- improve future duration estimates

Inputs:

- planned duration
- actual duration
- paused time
- distraction time
- task type
- area
- manual overrides

Outputs:

- expected duration range
- confidence band
- underestimation warning
- overestimation warning
- task-type duration priors

Preferred estimate format:

```text
Expected: 35–55 minutes
Confidence: medium
Risk factors: vague scope, previous similar tasks ran long
Warning: your 15-minute override is probably unrealistic
```

Do not use fake precision like:

```text
This will take exactly 42 minutes.
```

That is spreadsheet cosplay.

\---

## 10.4 Triage-Learning Meta-Workflow

Purpose:

- reduce future clarification burden

Inputs:

- user corrections
- area reassignments
- task/project flips
- repeated ambiguity types
- rejected AI suggestions

Outputs:

- better area inference
- better parsing thresholds
- better clarification questions
- fewer repeated errors

This is one of the safest places for bounded self-adjustment.

\---

## 10.5 Review Intelligence Meta-Workflow

Purpose:

- turn behavior into explicit insight

Inputs:

- review entries
- missed blocks
- duration errors
- overrides
- suggestion acceptance/rejection
- productivity ratings

Outputs:

- weekly insights
- friction hypotheses
- cleanup suggestions
- policy suggestions
- health warnings

\---

# 11\. Health model

Health should be mostly deterministic. AI can explain the result, but it should not invent the score.

## 11.1 System-wide health

Tracks:

- auth status
- database reachability
- AI parse success rate
- calendar connector status
- failed writes
- open incidents
- stale checks

## 11.2 Area operational health

Tracks:

- stale task ratio
- proposal acceptance rate
- missed-block rate
- review completion rate
- backlog drift
- override frequency

## 11.3 Meta-model health

Tracks:

| Meta-Model            | Health Signals                                               |
| --------------------- | ------------------------------------------------------------ |
| Priority model        | override rate, accepted classification rate, drift           |
| Duration model        | estimate error, underestimation bias, confidence calibration |
| Time preference model | block acceptance rate, productivity by time window           |
| Triage model          | correction rate, repeated ambiguity types                    |
| Scheduler             | proposal acceptance, conflict rate, reschedule churn         |
| Capture parser        | parse success, edit rate, clarification rate                 |

\---

# 12\. Approval and autonomy model

## 12.1 Automatic actions allowed

The system may automatically:

- parse input
- infer area
- classify tasks
- suggest priorities
- suggest next actions
- suggest time blocks
- flag conflicts
- compute health
- generate repair guidance
- summarize reviews

## 12.2 Approval required

The system must require approval before:

- creating/updating Google Calendar events
- changing core priority profiles
- changing preferred work/sleep windows
- applying major scheduling policies
- deleting/archiving important items
- changing connector permissions
- changing external-write behavior

## 12.3 Explicitly out of autonomous scope for v1

- email ingestion
- message ingestion
- autonomous calendar rewriting
- full conflict solving
- browser/computer-use automation
- broad internet browsing
- multi-agent orchestration
- self-healing without user visibility

\---

# 13\. Data model

## 13.1 Scope tables

### `areas`

Fields:

- `id`
- `user\\\\\\\_id`
- `name`
- `slug`
- `description`
- `color`
- `icon`
- `sort\\\\\\\_order`
- `is\\\\\\\_active`
- `created\\\\\\\_at`
- `updated\\\\\\\_at`

### `global\\\\\\\_defaults`

Fields:

- `user\\\\\\\_id`
- `default\\\\\\\_priority\\\\\\\_policy\\\\\\\_json`
- `default\\\\\\\_time\\\\\\\_policy\\\\\\\_json`
- `default\\\\\\\_duration\\\\\\\_policy\\\\\\\_json`
- `default\\\\\\\_health\\\\\\\_thresholds\\\\\\\_json`
- `default\\\\\\\_approval\\\\\\\_rules\\\\\\\_json`

\---

## 13.2 Workflow tables

### `capture\\\\\\\_items`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `raw\\\\\\\_text`
- `raw\\\\\\\_audio\\\\\\\_ref`
- `inferred\\\\\\\_area\\\\\\\_confidence`
- `status`
- `created\\\\\\\_at`

### `tasks`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `project\\\\\\\_id`
- `source\\\\\\\_capture\\\\\\\_item\\\\\\\_id`
- `title`
- `description`
- `status`
- `priority\\\\\\\_score`
- `priority\\\\\\\_confidence`
- `task\\\\\\\_type`
- `energy\\\\\\\_type`
- `estimated\\\\\\\_minutes\\\\\\\_low`
- `estimated\\\\\\\_minutes\\\\\\\_high`
- `due\\\\\\\_at`
- `created\\\\\\\_at`
- `updated\\\\\\\_at`

### `projects`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `title`
- `description`
- `status`
- `created\\\\\\\_at`
- `updated\\\\\\\_at`

### `time\\\\\\\_block\\\\\\\_proposals`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `task\\\\\\\_id`
- `proposed\\\\\\\_start`
- `proposed\\\\\\\_end`
- `rationale\\\\\\\_json`
- `conflict\\\\\\\_flag`
- `status`
- `created\\\\\\\_at`

### `calendar\\\\\\\_blocks`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `proposal\\\\\\\_id`
- `task\\\\\\\_id`
- `google\\\\\\\_event\\\\\\\_id`
- `start\\\\\\\_at`
- `end\\\\\\\_at`
- `status`
- `created\\\\\\\_at`
- `updated\\\\\\\_at`

### `execution\\\\\\\_sessions`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `task\\\\\\\_id`
- `calendar\\\\\\\_block\\\\\\\_id`
- `planned\\\\\\\_minutes`
- `actual\\\\\\\_minutes`
- `paused\\\\\\\_minutes`
- `distraction\\\\\\\_minutes`
- `productivity\\\\\\\_rating`
- `outcome`
- `created\\\\\\\_at`

### `review\\\\\\\_entries`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `review\\\\\\\_type`
- `summary\\\\\\\_json`
- `created\\\\\\\_at`

\---

## 13.3 Meta-layer tables

### `priority\\\\\\\_profiles`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `declared\\\\\\\_policy\\\\\\\_json`
- `learned\\\\\\\_policy\\\\\\\_json`
- `last\\\\\\\_reviewed\\\\\\\_at`

### `time\\\\\\\_preference\\\\\\\_profiles`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `declared\\\\\\\_windows\\\\\\\_json`
- `learned\\\\\\\_windows\\\\\\\_json`
- `last\\\\\\\_reviewed\\\\\\\_at`

### `duration\\\\\\\_profiles`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `task\\\\\\\_type`
- `estimate\\\\\\\_stats\\\\\\\_json`
- `last\\\\\\\_updated\\\\\\\_at`

### `triage\\\\\\\_learning\\\\\\\_profiles`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `correction\\\\\\\_patterns\\\\\\\_json`
- `confidence\\\\\\\_thresholds\\\\\\\_json`

### `suggestion\\\\\\\_records`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `suggestion\\\\\\\_type`
- `subject\\\\\\\_type`
- `subject\\\\\\\_id`
- `suggestion\\\\\\\_json`
- `status`
- `created\\\\\\\_at`

### `override\\\\\\\_records`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `subject\\\\\\\_type`
- `subject\\\\\\\_id`
- `override\\\\\\\_type`
- `old\\\\\\\_value\\\\\\\_json`
- `new\\\\\\\_value\\\\\\\_json`
- `reason`
- `created\\\\\\\_at`

\---

## 13.4 Health tables

### `health\\\\\\\_checks`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `subsystem`
- `status`
- `score`
- `details\\\\\\\_json`
- `checked\\\\\\\_at`

### `health\\\\\\\_incidents`

- `id`
- `user\\\\\\\_id`
- `area\\\\\\\_id`
- `subsystem`
- `severity`
- `incident\\\\\\\_code`
- `details\\\\\\\_json`
- `status`
- `opened\\\\\\\_at`
- `closed\\\\\\\_at`

### `repair\\\\\\\_guides`

- `id`
- `subsystem`
- `incident\\\\\\\_code`
- `guide\\\\\\\_json`
- `version`
- `created\\\\\\\_at`

\---

# 14\. State machines

## 14.1 Capture item

```text
new
→ parsed
→ triage\\\\\\\_required
→ resolved
→ archived
```

## 14.2 Task

```text
draft
→ active
→ scheduled
→ blocked
→ done
→ dropped
→ archived
```

## 14.3 Proposal

```text
proposed
→ edited
→ accepted
→ rejected
→ superseded
```

## 14.4 Calendar block

```text
scheduled
→ running
→ completed
→ missed
→ cancelled
```

## 14.5 Suggestion

```text
pending
→ accepted
→ rejected
→ ignored
```

\---

# 15\. Edge Function / backend function map

## 15.1 `parse\\\\\\\_capture`

Input:

- capture item ID
- raw text or transcript
- optional selected area

Actions:

- call AI with structured schema
- infer area
- extract task/project/blocker/proposal drafts
- create clarification items if needed

Output:

- structured parse result

\---

## 15.2 `triage\\\\\\\_apply`

Input:

- draft corrections
- accept/edit/reject decisions
- area decisions

Actions:

- persist accepted objects
- log corrections
- update triage-learning signals

\---

## 15.3 `propose\\\\\\\_blocks`

Input:

- task ID
- area context
- optional date range

Actions:

- fetch task
- fetch area policy
- fetch time preferences
- fetch duration priors
- query calendar availability
- generate local proposals only

\---

## 15.4 `approve\\\\\\\_calendar\\\\\\\_write`

Input:

- proposal ID
- final start/end
- user approval

Actions:

- create/update Google Calendar event
- save `google\\\\\\\_event\\\\\\\_id`
- log external write

\---

## 15.5 `mark\\\\\\\_block\\\\\\\_result`

Input:

- block ID
- outcome
- actual duration
- pauses
- distraction
- productivity rating

Actions:

- update calendar block
- create execution session
- update duration/productivity observations

\---

## 15.6 `weekly\\\\\\\_review`

Input:

- optional area ID
- date window

Actions:

- summarize area/system behavior
- generate insights
- create policy suggestions
- create cleanup suggestions

\---

## 15.7 `health\\\\\\\_check`

Input:

- optional subsystem or area

Actions:

- check connector/token health
- check failed writes
- compute deterministic health metrics
- create incidents where thresholds are crossed
- generate repair guidance if needed

Supabase Cron can schedule recurring jobs inside Postgres and can invoke Edge Functions periodically, but v1 should keep scheduled jobs minimal. ([Supabase](https://supabase.com/docs/guides/cron?utm_source=chatgpt.com))

\---

# 16\. Cost-minimized architecture rules

## 16.1 Default cost posture

Use:

- free/personal hosting where possible
- minimal backend services
- small models for routine parsing/classification
- AI only when it creates real workflow value
- no always-on intelligence

Vercel’s Hobby plan is free for personal projects, but its cron jobs are limited on Hobby accounts; Vercel may also invoke scheduled jobs within the specified hour rather than exactly at the minute. ([Vercel](https://vercel.com/docs/plans/hobby?utm_source=chatgpt.com))

## 16.2 Avoid in v1

- realtime voice
- vector database
- web search
- full-calendar sync
- multi-agent runtime
- autonomous writes
- separate paid backend
- heavy cron dependency
- advanced analytics warehouse

## 16.3 AI cost discipline

Use smaller models for:

- classification
- area inference
- basic health narratives
- low-stakes scoring

Use stronger models only for:

- complex capture parsing
- weekly reviews
- policy suggestions
- prompt/schema evaluation

OpenAI’s current pricing page lists lower rates for GPT-5.4 mini than larger models, so model routing matters for cost control. ([OpenAI](https://openai.com/api/pricing/?utm_source=chatgpt.com))

\---

# 17\. Security and trust model

## 17.1 Security requirements

- authenticated access only
- row-level access protection
- one user owns all operational data
- minimal Google Calendar scopes
- external writes logged
- model output validated
- secrets stored outside frontend
- calendar writes approval-gated
- AI response storage disabled where appropriate

OpenAI’s migration docs note that Responses are stored by default and can be disabled with `store: false`, which matters for a private personal workflow system. ([OpenAI Developers](https://developers.openai.com/api/docs/guides/migrate-to-responses?utm_source=chatgpt.com))

## 17.2 RLS policy pattern

Every user-owned table:

- `select`: only own rows
- `insert`: only rows with own `user\\\\\\\_id`
- `update`: only own rows
- `delete`: only own rows

Minimum indexes:

- `(user\\\\\\\_id)` on user-owned tables
- `(user\\\\\\\_id, area\\\\\\\_id)` on area-scoped tables
- `(user\\\\\\\_id, status)` on tasks/proposals
- `(user\\\\\\\_id, start\\\\\\\_at)` on calendar blocks
- `(user\\\\\\\_id, subsystem, checked\\\\\\\_at desc)` on health checks

\---

# 18\. V1 feature cut

## 18.1 Must ship

- multi-area support
- capture screen
- triage screen
- task/project persistence
- calendar/planning screen
- local time-block proposals
- approval-gated Google Calendar writes
- execute screen
- session tracking
- review screen
- health screen
- audit trail
- basic priority/time/duration meta-layer

## 18.2 Should ship

- productivity rating on past blocks
- duration override warnings
- policy suggestion cards
- area-aware weekly review
- repair guide flows
- persistent health badge

## 18.3 Can wait

- adaptive reminders
- advanced productivity analytics
- cross-area load balancing
- richer incident diagnosis
- onboarding templates by area
- background weekly review generation
- body-doubling / coworking
- commitment contracts
- context-aware location nudges

## 18.4 Keep out of v1

- email/message ingestion
- full autonomous rescheduling
- browser/computer-use automation
- multi-user collaboration
- broad internet research
- full project-management suite
- plugin architecture
- “self-healing” automation

\---

# 19\. Implementation process

The build process should be a compressed sequence, not a sprawling project.

## 19.1 Build philosophy

```text
Decide clearly
→ scaffold quickly
→ make visible workflows usable
→ harden risky surfaces
→ add learning loops
→ polish only what reduces friction
```

## 19.2 Process lanes

| Lane              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| Architecture lane | Freeze scope, entities, rules, approval gates, and dangerous boundaries |
| Production lane   | Build bounded features in small implementation tickets                  |
| Verification lane | Run the app, inspect behavior, debug flows, reduce friction             |
| Hardening lane    | Review auth, calendar writes, secrets, RLS, schemas, and migrations     |

## 19.3 Build order

Do not build in architecture-purity order. Build in value order:

1. Areas + auth + base schema
2. Capture → parse → triage
3. Triage → accept → tasks/projects
4. Task → proposed time block
5. Proposal → approve/edit/reject
6. Calendar write after approval
7. Execute screen + session tracking
8. Missed-block reschedule suggestion
9. Daily/weekly review
10. Basic health dashboard
11. Priority/time/duration learning
12. Repair guidance and polish

## 19.4 Hard rules during build

- one repo
- one schema source of truth
- one orchestrator pattern
- tiny tickets
- no silent external writes
- no feature without an acceptance test
- no background job unless it removes real friction
- no analytics before workflows work
- no “smart” feature without an explanation surface

\---

# 20\. Acceptance criteria

## 20.1 Capture

Successful if:

- user can dump audio/text
- system creates structured drafts
- area is assigned or triaged
- missing info is surfaced
- user can accept/edit/reject outputs

## 20.2 Planning

Successful if:

- tasks can become proposed blocks
- proposals respect area policies
- conflicts are flagged
- user can approve/edit/reject
- approved proposals write to calendar

## 20.3 Execution

Successful if:

- user can start from one task
- timer/session data works
- user can mark stuck/distracted/paused/completed
- execution data feeds learning tables

## 20.4 Review

Successful if:

- daily review closes loops
- weekly review summarizes patterns
- system proposes useful changes
- area-specific drift is visible

## 20.5 Health

Successful if:

- failures are visible
- repair guidance is actionable
- health is shown by subsystem and area
- AI explains health, but deterministic logic scores it

## 20.6 Overhead

Successful if:

- weekly maintenance remains low
- user does not need to babysit the system
- the system does not become its own hobby

\---

# 21\. Final canonical product statement

**Area-Scoped Personal Workflow Cockpit** is a private, one-user, AI-assisted workflow system that converts messy input into structured work, stages scheduling decisions for approval, learns separately across life areas, and exposes operational/model health so the system stays useful without becoming a maintenance burden.

The strongest version is not the most autonomous version.

The strongest version is:

```text
high autonomy for parsing and suggesting
medium autonomy for scoring and learning
low autonomy for external writes and policy changes
```

That is the boundary that keeps it powerful without turning it into a tiny bureaucrat with an API key.

Yes. The wiki should be revised so this material becomes a \*\*core design doctrine\*\*, not an appendix.

The current wiki already includes some of this thinking, but the missing upgrade is sharper:

> The product is not only a task/scheduling cockpit. It is an \\\*\\\*ambiguity-to-motion system\\\*\\\* designed for executive-function friction: time blindness, task initiation failure, working-memory overload, overwhelm, and recovery after disruption.

Below is the clean integration patch.

\---

# Add to Wiki: Foundational Operating Doctrine

## AI as a Clarity Engine, Not an Answer Machine

The system’s first job is not to “make a perfect plan.” Its first job is to help the user **make sense of messy work**.

Large ambiguous tasks usually begin in a state of uncertainty: unclear objective, unknown workstreams, unknown constraints, unknown risks, unknown effort, and unclear first action. The Cynefin framework is relevant here because it treats decision-making differently depending on the domain/context: clear, complicated, complex, chaotic, and confused/aporetic. That maps well to this product because the app must first diagnose the kind of situation before recommending the next move. ([The Cynefin Co](https://thecynefin.co/effective-decision-making-support-tool/?srsltid=AfmBOooKQIWqrJ73DsG2hztPF8sQlPZrhkU-xfDMtp4hiHWbwUL6OHXM&utm_source=chatgpt.com))

The planning method should be **rolling-wave planning plus AI**: plan the near term in detail, keep later phases rough, and update the plan as reality gives feedback. PMI describes rolling-wave planning as detailing the foreseeable future while periodically reevaluating costs/dates as the project evolves. ([Project Management Institute](https://www.pmi.org/learning/library/rolling-wave-approach-project-management-10514?utm_source=chatgpt.com))

Agile project management reinforces the same principle: break work into smaller iterations, execute, evaluate, and adapt rather than pretending the full path is knowable upfront. ([Atlassian](https://www.atlassian.com/agile/project-management?utm_source=chatgpt.com))

## Core Operating Sequence

This sequence should become a first-class workflow in the product:

| Stage    | Goal                                  | System Role                                                 |
| -------- | ------------------------------------- | ----------------------------------------------------------- |
| Dump     | Get the mess out of the head          | Capture raw thoughts/audio/text                             |
| Diagnose | Identify what kind of problem this is | Classify ambiguity, complexity, urgency, uncertainty        |
| Bound    | Set constraints                       | Clarify time, energy, budget, quality, area, risk tolerance |
| Slice    | Break the work into chunks            | Create workstreams, tasks, blockers, first moves            |
| Discover | Reduce unknowns                       | Generate questions, research tasks, dependency checks       |
| Act      | Start safely                          | Propose a first short execution wave                        |
| Review   | Learn from reality                    | Update estimates, priorities, assumptions, and next wave    |

This also mirrors the diverge/converge pattern: first expand possibilities and interpretations, then narrow into decisions and action. Nielsen Norman Group describes diverge/converge as first generating or analyzing independently, then converging toward a collective output. ([Nielsen Norman Group](https://www.nngroup.com/articles/diverge-converge/?utm_source=chatgpt.com))

\---

# Add to Wiki: Sense-Making Engine

## Purpose

The Sense-Making Engine sits before planning and scheduling.

Its job is to prevent the user from jumping straight from “messy thought” to “fake precise plan.”

## Required AI Output for Ambiguous Work

Whenever the user captures a large/unclear task, the system should produce:

1. likely objective
2. possible workstreams
3. known information
4. unknown information
5. assumptions
6. constraints to clarify
7. risks, blockers, dependencies
8. smallest useful first version
9. first 3 actions
10. what not to do yet
11. rolling-wave plan
12. discovery questions that would materially improve the plan
13. confidence levels
14. reversible vs irreversible actions

## Required Anti-Hallucination Rules

The AI must:

- separate facts, assumptions, guesses, and decisions
- use confidence levels
- avoid exact timelines when work is unknown
- prefer ranges over single-point estimates
- prioritize reversible actions before irreversible commitments
- identify what must be learned before committing

## Best First-Move Rule

For any high-ambiguity task, the system should always be able to answer:

```text

What is the smallest useful next step that reduces uncertainty or creates momentum within 30–60 minutes?

```

This should become a visible button/action in the UI.

Suggested UI label:

> \\\*\\\*Find First Move\\\*\\\*

\---

# Add to Wiki: Ambiguity Object Model

Add these entities or fields.

## `ambiguity\\\_assessments`

Fields:

- `id`
- `user\\\_id`
- `area\\\_id`
- `source\\\_capture\\\_item\\\_id`
- `problem\\\_type`
- `complexity\\\_level`
- `knowns\\\_json`
- `unknowns\\\_json`
- `assumptions\\\_json`
- `constraints\\\_json`
- `risks\\\_json`
- `dependencies\\\_json`
- `confidence\\\_score`
- `recommended\\\_first\\\_move`
- `created\\\_at`

## `discovery\\\_questions`

Fields:

- `id`
- `user\\\_id`
- `area\\\_id`
- `source\\\_item\\\_id`
- `question`
- `why\\\_it\\\_matters`
- `answer\\\_status`
- `answer\\\_text`
- `created\\\_at`
- `resolved\\\_at`

## `first\\\_wave\\\_plans`

Fields:

- `id`
- `user\\\_id`
- `area\\\_id`
- `source\\\_item\\\_id`
- `time\\\_horizon`
- `goal`
- `actions\\\_json`
- `not\\\_yet\\\_json`
- `success\\\_condition`
- `review\\\_trigger`
- `created\\\_at`

## `assumption\\\_logs`

Fields:

- `id`
- `user\\\_id`
- `area\\\_id`
- `subject\\\_type`
- `subject\\\_id`
- `assumption\\\_text`
- `confidence`
- `status`
- `validated\\\_at`
- `invalidated\\\_at`

This matters because assumptions must become trackable objects, not hidden prompt residue.

\---

# Update Existing Screens

## Capture Screen: Add Sense-Making Mode

Current capture should support two modes:

| Mode                 | Use Case                 | Output                                 |
| -------------------- | ------------------------ | -------------------------------------- |
| Quick Capture        | Simple task or reminder  | Task/project/block draft               |
| Sense-Making Capture | Big, unclear, messy work | Ambiguity assessment + first-wave plan |

The app should detect when the input is ambiguous and suggest:

> “This looks bigger than a normal task. Want to structure it first?”

## Triage Screen: Add Ambiguity Review

Triage should not only ask “task or project?”

It should also ask:

- Is the objective clear?
- Is this actually multiple workstreams?
- Is the area correct?
- Is there enough information to schedule it?
- Is this ready for execution, or still discovery?
- What is the first reversible move?

## Planning Screen: Add Rolling-Wave Plans

Planning should separate:

| Planning Level           | Detail Level                      |
| ------------------------ | --------------------------------- |
| First wave               | detailed                          |
| Later waves              | rough                             |
| Unknown-dependent work   | parked until discovery            |
| Irreversible commitments | blocked until confidence improves |

## Execute Screen: Add First-Move Launch

For ambiguous or high-friction tasks, execution should show:

- first tiny step
- why this step matters
- expected duration range
- stop condition
- “good enough for now” definition
- next review point

## Review Screen: Add Reality Feedback

Daily/weekly review should ask:

- Which assumptions were wrong?
- Which estimates were off?
- Which tasks were secretly bigger?
- Which first moves created momentum?
- Which plans were planning theatre?
- What should be re-sliced?

This is where the system learns from reality instead of worshipping the original plan.

\---

# Add to Wiki: Executive-Function Support Layer

This section should explicitly inform the product. The app should be designed for users who struggle with initiation, time estimation, task switching, working-memory overload, and recovery after disruption.

Important: position this as **executive-function support**, not medical treatment.

CHADD describes time blindness as affecting punctuality, deadlines, bill payment, appointments, and remembering commitments, which supports making time more visible and externalized in the product. ([CHADD](https://chadd.org/attention-article/time-unbound-managing-time-blindness-at-work/?utm_source=chatgpt.com))

## Executive-Function Design Requirements

| Need                | Product Requirement                                                      |
| ------------------- | ------------------------------------------------------------------------ |
| Time blindness      | visual timelines, countdown timers, end-time prediction, duration ranges |
| Task initiation     | first tiny step, breakdown button, “pick next useful task”               |
| Sequencing          | step-by-step task playlists, next-step handoff                           |
| Working memory      | always-visible current task, quick capture sidebar, widgets later        |
| Distraction         | one-task execution mode, focus timer, distraction logging                |
| Motivation          | small wins, completion feedback, progress visibility                     |
| Flexibility         | missed-block recovery, reschedule suggestions, forgiving planning        |
| Overwhelm reduction | visual structure, minimal daily list, area filters                       |
| Energy regulation   | energy labels, break prompts, task-energy matching                       |
| Personalization     | area-specific preferences, icons, colors, work styles                    |

Apps like Tiimo emphasize visual timers, AI checklists, flexible scheduling, widgets, and focus timers; Goblin Tools focuses on breaking down overwhelming tasks; and Llama Life uses timeboxing/countdown timers to support focusing on one task at a time. These are not products to copy wholesale, but they reveal useful design patterns. ([Tiimo](https://www.tiimoapp.com/?utm_source=chatgpt.com))

\---

# Add to Wiki: ADHD-Informed Feature Priority

## V1 Must-Have

| Feature                           | Why                                       |
| --------------------------------- | ----------------------------------------- |
| Visual calendar/planning screen   | Makes time visible                        |
| Countdown timer in Execute screen | Creates time boundary                     |
| First tiny step                   | Reduces task initiation friction          |
| Task breakdown                    | Turns vague blobs into executable actions |
| One-task execution mode           | Reduces overwhelm                         |
| Quick capture sidebar             | Protects working memory                   |
| Missed-block recovery             | Makes disruption survivable               |
| Productivity rating               | Creates feedback loop                     |
| Duration range estimation         | Fights time agnosia                       |
| Area-specific learning            | Prevents mixed-context bad advice         |

## V1.5 Strong Candidates

| Feature                    | Why                                 |
| -------------------------- | ----------------------------------- |
| Friction audit before task | Identifies what will block starting |
| Auto-prep checklist        | Reduces setup friction              |
| Energy-based planning      | Schedules work by cognitive load    |
| Transition buffers         | Prevents cascade failure            |
| Definition of done         | Fights perfectionism                |
| Weekly entropy reset       | Prevents backlog rot                |
| WIP limits                 | Prevents too many active tasks      |

## V2 / Later

| Feature                       | Why Wait                                  |
| ----------------------------- | ----------------------------------------- |
| Body-doubling sessions        | Valuable, but adds social/live complexity |
| Commitment contracts          | Useful, but behaviorally sensitive        |
| Context-aware nudges          | Risk of notification fatigue              |
| Real-world capture everywhere | High connector complexity                 |
| Team/project ADHD layer       | Multi-user complexity too early           |
| App/site blocking             | Platform-specific and potentially brittle |

\---

# Add to Wiki: Anti-Planning-Theatre Guardrails

The system must explicitly avoid outputs that look impressive but do not create movement.

## Bad AI Outputs to Avoid

| Bad Output                             | Why It Fails               |
| -------------------------------------- | -------------------------- |
| Exact timelines for unknown work       | Fake confidence            |
| Huge task trees                        | Over-decomposition         |
| Beautiful roadmap with no first action | Decorative nonsense        |
| Generic best practices                 | Context-free advice        |
| Too many options                       | Increases overwhelm        |
| Premature optimization                 | Turns product into a hobby |
| No confidence labels                   | Hides uncertainty          |
| No “not yet” list                      | Encourages scope creep     |

## Product Rule

Every planning output must include:

```text

Next action

Timebox

Confidence level

Known unknowns

Review trigger

What not to do yet

```

If it does not include those, it is not a useful plan.

\---

# Add to Wiki: New Acceptance Criteria

## Sense-Making Acceptance Criteria

The product succeeds if:

- messy input becomes structured without pretending certainty
- large ambiguous work gets classified before planning
- unknowns and assumptions are visible
- the user receives a first reversible move
- near-term work is detailed, later work remains rough
- review updates the next wave based on reality

## Executive-Function Acceptance Criteria

The product succeeds if:

- time becomes more visible
- starting becomes easier
- “what now?” is always obvious
- missed blocks do not collapse the whole day
- task lists do not become giant guilt museums
- duration estimates improve over time
- the system helps recover from disruption without shame-language
- the system reduces cognitive load instead of adding management overhead

\---

# Updated Product Statement

Replace the old final statement with this stronger version:

**Area-Scoped Personal Workflow Cockpit** is a private, one-user, AI-assisted workflow system that converts messy audio/text input into structured work, helps diagnose ambiguous tasks, makes unknowns visible, proposes the smallest useful next move, stages scheduling decisions for approval, supports executive-function friction, learns separately across life areas, and monitors its own usefulness without becoming a maintenance burden.

The product’s core loop is:

```text

Dump

→ Diagnose

→ Bound

→ Slice

→ Discover

→ Act

→ Review

```

The product’s autonomy boundary is:

```text

High autonomy for parsing and sense-making

Medium autonomy for scoring, learning, and suggesting

Low autonomy for external writes and policy changes

```

That is the clean integration. The wiki should now be framed as an **ambiguity-to-motion operating system**, not merely a task manager with AI sprinkled on top.
