# PROJECT_BRIEF.md

# Area-Scoped Personal Workflow Cockpit — Project Brief

## 1. Product Summary

Build a private, one-person, low-cost web app that turns messy audio/text thoughts into structured work, helps make ambiguous tasks clear, proposes time-blocks for approval, supports execution, learns from outcomes, and monitors its own usefulness.

The product is an **ambiguity-to-motion system**, not merely a task manager.

Core loop:

```text
Dump → Diagnose → Bound → Slice → Discover → Act → Review
```

Autonomy boundary:

```text
High autonomy: parsing, sense-making, classification, suggestion
Medium autonomy: scoring, learning, pattern detection
Low autonomy: calendar writes, policy changes, deletion/archive
```

## 2. Product Thesis

The main failure in large ambiguous tasks is usually not execution. It is sense-making.

The app should help the user answer:

- What is this task really?
- What area of life does it belong to?
- What is known?
- What is unknown?
- What assumptions am I making?
- What should I not do yet?
- What is the smallest useful next move?
- What can be scheduled safely?
- What should wait until uncertainty is reduced?

## 3. Primary User

One person using the system for:

- main job
- personal life
- volunteer work
- side projects
- family/health/admin work

The system should assume:

- high task-initiation friction
- time blindness / weak duration estimation
- working-memory overload
- perfectionism risk
- strong hyperfocus once started
- different operating patterns across areas

## 4. Core Jobs To Be Done

1. Capture messy input quickly.
2. Convert input into structured tasks, projects, blockers, unknowns, and proposed first moves.
3. Keep life areas separate so priorities and patterns do not contaminate each other.
4. Convert accepted work into local time-block proposals.
5. Require approval before writing anything to Google Calendar.
6. Help the user start the current task with one visible first step.
7. Learn from actual duration, missed blocks, overrides, and productivity ratings.
8. Show system/model health clearly.
9. Stay cheap, simple, and maintainable.

## 5. Product Positioning

This is not:

- a full autonomous agent
- a second-brain knowledge base
- a project-management suite
- a team collaboration app
- a self-healing life OS
- an email/message ingestion engine
- a computer-use/browser automation agent

This is:

- a personal workflow cockpit
- an AI-assisted sense-making layer
- an approval-first scheduler
- a one-task execution rail
- an area-scoped learning system
- a system-health dashboard

## 6. V1 Success Criteria

V1 is successful if:

- text capture works reliably
- optional audio capture can be transcribed and parsed
- ambiguous work gets a sense-making assessment
- tasks/projects/time-block proposals are created from captures
- areas are first-class and used consistently
- proposed blocks can be approved/edited/rejected
- approved blocks can be written to Google Calendar
- one-task execution mode works
- missed blocks can be marked and rescheduled as proposals
- daily/weekly review captures reality
- basic health checks surface failures
- the app remains usable without becoming a maintenance burden

## 7. Optimization Priorities

Ranked priorities:

1. Fast build
2. Maintainability
3. Low cost
4. Minimal complexity
5. User trust
6. Future AI-agent maintainability
7. Feature richness

If a feature conflicts with these priorities, cut or defer it.

## 8. Pre-Build Audit

### 8.1 Unclear Assumptions

| Assumption | Why It Is Unclear | Decision Needed Before Build |
|---|---|---|
| Audio is required in V1 | Audio adds storage, transcription, permissions, and UX complexity | Build text capture first; add audio as simple submit-to-transcribe only |
| Google Calendar write access is necessary immediately | Calendar OAuth is one of the riskiest integrations | Phase it after local proposals work |
| Meta-learning needs to be advanced in V1 | Real learning requires usage data | Start with explicit profiles + logs; derive learning later |
| Health dashboard needs AI diagnosis | Deterministic checks are more reliable | Use rules for scoring; AI only explains |
| Area inference should be automatic | Wrong area assignment can pollute learning | Auto-suggest with confidence; user approves low-confidence cases |
| The user will perform daily reviews | Review friction may kill usage | Make daily review optional and lightweight |
| Scheduling suggestions need full conflict solving | Full scheduling logic is hard | Flag conflicts and suggest slots; user decides |

### 8.2 Risky Requirements

| Risk | Why Risky | Mitigation |
|---|---|---|
| Calendar writes | External mutation risk | Approval-only writes, audit log, minimal scopes |
| Autonomous rescheduling | Can create calendar chaos | Exclude from V1 |
| AI-generated structured objects | Model may misclassify or over-split | Strict schemas, confidence fields, triage screen |
| Long-term pattern learning | Can become black-box advice | Explain all suggestions and keep user-controlled policy |
| Personal data storage | Sensitive life/task data | RLS, minimal logs, `store: false`, deletion/export later |
| Cron/background jobs | Reliability/cost/complexity drag | User-triggered by default; max 1-3 scheduled jobs later |
| Over-scoped UX | Too many screens kills fast build | Build vertical slice first |

### 8.3 Overbuilt Features To Avoid

Do not build in V1:

- email/message ingestion
- Slack/WhatsApp ingestion
- autonomous conflict solver
- live realtime voice assistant
- browser/computer-use automation
- vector database
- multi-agent app runtime
- advanced analytics warehouse
- location-aware nudges
- body-doubling/coworking
- team collaboration
- app/site blocker
- full plugin architecture
- self-healing automation

### 8.4 Missing Acceptance Criteria To Define

Before coding each feature, define:

- What does “parsed correctly” mean?
- What confidence threshold routes to triage?
- What makes a proposed block “useful”?
- What exactly triggers a health warning?
- What is a failed calendar write?
- What must be logged for every external action?
- What is the minimum review flow?
- What data can be sent to AI?
- What does “low maintenance” mean in measurable terms?

Suggested measurable targets:

- Capture parse accepted without major edit at least 70% after iteration.
- Calendar write failure surfaced within same interaction.
- User can create a task from text capture in under 30 seconds.
- User can accept/edit/reject proposals without leaving the planning screen.
- No external write occurs without explicit user action.
- Health screen identifies auth/calendar/AI failures separately.
- App has no more than 3 scheduled jobs in V1.5.
- Weekly review takes under 10 minutes.

## 9. Build Strategy

Build a thin vertical slice first:

```text
Area setup
→ text capture
→ parse into drafts
→ triage
→ create task
→ propose block locally
→ approve/write calendar
→ execute task
→ review result
→ health check
```

Only after that works should meta-learning deepen.

## 10. Final Product Statement

Area-Scoped Personal Workflow Cockpit is a private AI-assisted workflow system that converts messy input into structured work, helps diagnose ambiguity, proposes the smallest useful next move, stages scheduling decisions for approval, supports executive-function friction, learns separately across life areas, and monitors its own usefulness without becoming a maintenance burden.

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
