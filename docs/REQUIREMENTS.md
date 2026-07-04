# REQUIREMENTS.md

# Requirements — Area-Scoped Personal Workflow Cockpit

## 1. Requirement Levels

Use these labels:

- **MUST**: required for V1
- **SHOULD**: strong V1.5 candidate
- **COULD**: later enhancement
- **WON'T V1**: explicitly excluded for now

## 2. Core Functional Requirements

### FR-001 — Area Management

**Priority:** MUST

The user can create, edit, archive, and sort areas of life.

Default seed areas:

- Main Job
- Personal
- Volunteer Work
- Side Project

Acceptance criteria:

- User can create an area with name, color, icon, and description.
- User can mark an area inactive without deleting historical data.
- Every task/project/proposal can belong to one area.
- Area is visible in capture, triage, planning, execution, review, and health screens.

---

### FR-002 — Text Capture

**Priority:** MUST

The user can paste or type messy thoughts into a capture box.

Acceptance criteria:

- User can submit raw text.
- Capture item is persisted before AI parsing starts.
- If AI parsing fails, raw text is not lost.
- User can optionally pre-select an area.
- System can parse into drafts, not final committed objects.

---

### FR-003 — Audio Capture

**Priority:** SHOULD for V1, can be deferred if time is tight

Audio should be implemented as record/upload → transcribe on submit → parse transcript.

Acceptance criteria:

- No live realtime voice in V1.
- Audio is not continuously streamed.
- Transcript is shown before or alongside parsed output.
- Failed transcription does not delete the audio/transcript attempt.
- User can edit transcript before parsing if needed.

---

### FR-004 — Sense-Making Assessment

**Priority:** MUST

For large or ambiguous captures, the system creates an ambiguity assessment.

Required fields:

- likely objective
- possible workstreams
- knowns
- unknowns
- assumptions
- constraints
- risks
- dependencies
- first reversible move
- first 3 actions or first-wave outline when the capture is larger than one move
- what not to do yet
- confidence level
- review trigger

Acceptance criteria:

- User can see facts vs assumptions vs guesses.
- User can convert first moves into tasks.
- User can answer or resolve discovery questions.
- System avoids exact timelines for unknown work.
- System proposes a 30-60 minute uncertainty-reducing next step when applicable.
- System keeps near-term ambiguous work detailed enough to start while leaving later waves rough until discovery improves confidence.

---

### FR-005 — AI Parsing Into Drafts

**Priority:** MUST

The AI converts captures into structured draft objects.

Draft types:

- task draft
- project draft
- blocker draft
- time-block proposal draft
- clarification item
- ambiguity assessment

Acceptance criteria:

- AI output must validate against a JSON schema.
- Invalid model output is rejected and shown as a recoverable error.
- Each draft includes confidence.
- Drafts are not committed until accepted or triaged.
- Low-confidence items route to triage.

---

### FR-006 — Triage

**Priority:** MUST

The user reviews uncertain or newly parsed objects.

Acceptance criteria:

- User can accept, edit, reject, split, merge, defer, or reassign area.
- User can change task/project classification.
- User corrections are logged.
- Corrections feed future triage-learning signals for that area.
- User can commit accepted items to real task/project records.

---

### FR-007 — Task and Project Management

**Priority:** MUST

Basic task/project persistence.

Acceptance criteria:

- User can create/edit/archive tasks and projects.
- Task has title, description, area, status, priority, task type, estimated duration range, due date, and project link.
- Project has title, description, area, status, and linked tasks.
- User can filter by area and status.

---

### FR-008 — Local Time-Block Proposals

**Priority:** MUST

The app creates proposed time blocks before writing to any external calendar.

Acceptance criteria:

- Proposal has start, end, area, task, status, rationale, and conflict flag.
- User can approve, edit, reject, or supersede.
- Proposal can be generated without Google Calendar write access.
- Conflict status is advisory.

---

### FR-009 — Google Calendar Free/Busy Check

**Priority:** MUST for calendar integration phase

The app checks availability before suggesting or writing calendar blocks.

Acceptance criteria:

- App can query free/busy for configured calendar.
- App does not store full external calendar history.
- App stores only free/busy-derived conflict flags and app-created event IDs.
- Failure to check free/busy is shown clearly.

---

### FR-010 — Approval-Gated Google Calendar Write

**Priority:** MUST for calendar integration phase

The app writes to Google Calendar only after explicit user approval.

Acceptance criteria:

- User must click an explicit approve/write action.
- Approved write creates a calendar event.
- Created event ID is stored.
- Every write creates an audit record.
- Failed write is shown immediately and does not mark the block as scheduled.
- No AI response can directly trigger a calendar write.

---

### FR-011 — Execution Screen

**Priority:** MUST

A single-task execution mode.

Acceptance criteria:

- Shows one current task/block.
- Shows area and project context.
- Shows first tiny step.
- Has timer.
- User can pause, mark distracted, mark stuck, complete, or stop.
- End of session asks for outcome, productivity rating, actual duration, and optional notes.
- Captured session data updates duration/productivity logs.

---

### FR-012 — Missed Block Recovery

**Priority:** MUST

User can mark a scheduled block missed and get reschedule proposals.

Acceptance criteria:

- User can mark missed from calendar/planning screen.
- System asks whether to reschedule, drop, defer, or leave unscheduled.
- Reschedule creates proposals, not direct writes.
- User approves any external calendar update.

---

### FR-013 — Review

**Priority:** MUST

Daily and weekly review flows.

Daily review acceptance criteria:

- Shows completed, missed, moved, blocked, and open items.
- User can move/drop/archive/update tasks.
- Review can be completed in under 5 minutes.

Weekly review acceptance criteria:

- Shows area-level backlog health.
- Shows missed-block patterns.
- Shows duration-estimation patterns.
- Shows priority/policy suggestions.
- User must approve any policy changes.

---

### FR-014 — Meta-Learning Logs

**Priority:** MUST as logs, SHOULD as advanced learning

The app stores behavioral signals.

Signals:

- accepted/rejected AI suggestions
- area reassignment
- duration actual vs estimate
- productivity ratings
- missed blocks
- manual overrides
- policy suggestion outcomes

Acceptance criteria:

- Logs are area-scoped.
- Logs are inspectable at a basic level.
- Logs do not silently change core policies.
- Derived suggestions cite the signals used.

---

### FR-015 — Health Dashboard

**Priority:** MUST

A system-health screen shows whether the app is functioning.

Subsystems:

- auth
- database
- AI parsing
- AI review
- calendar connector
- scheduler
- priority model
- duration model
- time preference model

Acceptance criteria:

- Health score is rule-based, not AI-invented.
- AI can explain health but cannot decide the score.
- Each incident has severity, subsystem, details, and repair steps.
- Health can be viewed system-wide and by area.

---

### FR-016 — User Data Export

**Priority:** SHOULD

The user can download a complete JSON copy of their account data on demand.

Acceptance criteria:

- Export is available only to the signed-in user and covers only that user's rows (RLS-bounded).
- Export includes all user-owned workflow tables: areas, captures, tasks, projects, time-block proposals, calendar blocks, execution sessions, review entries, external-write audit events, suggestion records, override records, and health history.
- Export never includes secrets or OAuth token material (the Google Calendar connection table is excluded).
- Export is read-only: it must not mutate or delete any data.
- A failed export reports a plain-language, recoverable error and exports nothing partial.

---

### Product Loop and Autonomy Boundary

The V1 product loop is: capture messy input, diagnose ambiguity, bound the work, slice it into a reversible next move, discover missing information, act, and review the outcome. Requirements that support AI assistance must preserve this ambiguity-to-motion loop instead of turning LifeOS into a generic task list or autonomous agent.

Autonomy is intentionally tiered:

- AI may parse, classify, assess ambiguity, and suggest next moves.
- Rule-based code may score, surface patterns, and produce learning signals from approved logs.
- External calendar writes, core policy changes, and destructive archive/delete behavior require explicit user action.

When work is uncertain, the system should help the user distinguish facts, assumptions, guesses, unknowns, constraints, reversible versus irreversible actions, and what not to do yet before encouraging commitment to a plan. Planning output for ambiguous work must include a next action, timebox, confidence level, known unknowns, review trigger, and what not to do yet.

## 3. Non-Functional Requirements

### NFR-001 — Low Cost

- Use free/low-cost hosting where possible.
- Avoid realtime voice in V1.
- Avoid web search in app runtime.
- Avoid vector database in V1.
- Use cost-optimized AI model tier for routine classification/parsing.
- Use stronger model tier only for complex review or admin/prompt evaluation.

Acceptance criteria:

- App can run for one person with near-zero fixed platform cost at start.
- AI calls are user-triggered or review-triggered, not constantly background-running.

---

### NFR-002 — Maintainability

- Keep one repo.
- Keep one schema source of truth.
- Prefer boring CRUD plus typed **Next.js Route Handlers / Server Actions** (Supabase Edge Functions only when justified per `docs/adr/0001-v1-server-boundary.md`).
- Avoid multi-agent orchestration inside app.
- Use strict TypeScript types and shared schemas.

Acceptance criteria:

- A future AI coding agent can understand the app from docs plus AGENTS.md.
- Every external integration has a small wrapper function.
- No business logic hidden only in prompts.

---

### NFR-003 — Privacy

- Use authenticated access only.
- Enable Row Level Security on all user-owned tables.
- Store secrets only server-side.
- Use `store: false` for AI calls where supported.
- Do not send unnecessary historical data to AI.
- Keep audit logs but avoid storing full sensitive prompt payloads where not needed.

---

### NFR-004 — Reliability

- Raw captures must not be lost.
- AI failures must be recoverable.
- Calendar writes must be idempotent or safely retryable.
- External write failures must be visible.
- Health dashboard must separate connector failures from AI failures.

---

### NFR-005 — Simplicity

- No more than **six primary workflow screens** in V1: Capture, Triage, Calendar / Planning, Execute, Review, Health. **Settings** (areas, policies, integrations) is **secondary / admin** and does not count toward this limit.
- No background job is allowed unless tied to a clear user value.
- No autonomous external actions.
- No generalized plugin system.

### Operating-Layer Guardrails

The next approved planning focus after the current governance cleanup is the project/task/stakeholder/dependency/context operating layer.

Use that focus to improve how accepted work is structured, related, reviewed, and surfaced inside the existing LifeOS workflow.

Do not read that as approval for new ingestion channels, browser/computer-use automation, realtime voice, vector search, plugin marketplaces, multi-agent runtime, team collaboration, public SaaS billing, advanced analytics warehouses, self-healing automation, broad web browsing, or new vendors/integrations. The canonical "do not build" and change-control lists remain `AGENTS.md` section 4 and section 20.

Background-reference docs may inform planning, but they cannot expand implementation scope on their own.

If an issue, prompt, or plan for operating-layer work asks for behavior outside this guardrail, stop and report the gap before coding.

## 4. Explicit Non-Goals

V1 will not include:

- team collaboration
- email/message ingestion
- Slack/WhatsApp integration
- autonomous calendar conflict solving
- computer-use/browser automation
- location-aware nudges
- body-doubling sessions
- full analytics warehouse
- vector search
- multi-agent runtime
- public SaaS billing

## 5. Requirement Risk Review

| Requirement      | Risk       | Decision                        |
| ---------------- | ---------- | ------------------------------- |
| Audio capture    | Medium     | Keep submit-based, not realtime |
| Calendar write   | High       | Approval-only, audit-logged     |
| Meta-learning    | Medium     | Start as logs + suggestions     |
| Health dashboard | Low/Medium | Rule-based first                |
| Sense-making     | Medium     | Strict schema + triage          |
| Area inference   | Medium     | Confidence + user correction    |
| Cron jobs        | Medium     | Avoid unless necessary          |

## Reference Links

These documents are intentionally grounded in stable platform capabilities, not hardcoded vendor-specific hype.

- OpenAI Structured Outputs: [https://developers.openai.com/api/docs/guides/structured-outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- OpenAI Responses API migration / `store: false`: [https://developers.openai.com/api/docs/guides/migrate-to-responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- Supabase Row Level Security: [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Supabase Edge Functions: [https://supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)
- Supabase Cron: [https://supabase.com/docs/guides/cron](https://supabase.com/docs/guides/cron)
- Google Calendar Freebusy: [https://developers.google.com/workspace/calendar/api/v3/reference/freebusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy)
- Google Calendar Events Insert: [https://developers.google.com/workspace/calendar/api/v3/reference/events/insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- Vercel Cron Jobs / Hobby limits: [https://vercel.com/docs/cron-jobs/usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- Anthropic Building Effective Agents: [https://www.anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents)
