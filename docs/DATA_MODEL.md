# DATA_MODEL.md

# Data Model — Area-Scoped Personal Workflow Cockpit

## 1. Design Principles

1. Area is a first-class object, not a tag.
2. Most workflow and learning records are area-scoped.
3. AI recommendations are separate from user decisions.
4. External writes are audit-logged.
5. Use JSON fields for evolving policy payloads, but not for core relational structure.
6. Keep V1 relational schema simple.
7. Prefer soft archive over destructive delete.

## 2. Core Entity Groups

```text
Scope
  ├─ areas
  └─ global_defaults

Workflow
  ├─ capture_items
  ├─ ambiguity_assessments
  ├─ discovery_questions
  ├─ projects
  ├─ tasks
  ├─ time_block_proposals
  ├─ calendar_blocks
  ├─ execution_sessions
  └─ review_entries

Meta-Learning
  ├─ priority_profiles
  ├─ time_preference_profiles
  ├─ duration_profiles
  ├─ triage_learning_profiles
  ├─ suggestion_records
  └─ override_records

Health / Audit
  ├─ health_checks
  ├─ health_incidents
  ├─ repair_guides
  ├─ google_calendar_connections
  ├─ external_write_events
  ├─ ai_recommendations
  └─ user_decisions
```

## 3. Scope Tables

### 3.1 `areas`

Purpose: user-defined life/work scopes.

| Column      | Type          | Notes                    |
| ----------- | ------------- | ------------------------ |
| id          | uuid pk       | generated                |
| user_id     | uuid          | owner                    |
| name        | text          | e.g. Main Job            |
| slug        | text          | unique per user          |
| description | text nullable | optional                 |
| color       | text nullable | UI color                 |
| icon        | text nullable | emoji/icon key           |
| sort_order  | int           | user ordering            |
| is_active   | boolean       | archive without deletion |
| created_at  | timestamptz   | generated                |
| updated_at  | timestamptz   | generated                |

Constraints:

- unique `(user_id, slug)`
- `user_id` required
- no hardcoded PostgreSQL enum for area names

Indexes:

- `(user_id)`
- `(user_id, is_active)`
- `(user_id, sort_order)`

---

### 3.2 `global_defaults`

Purpose: fallback policy values.

| Column                         | Type        |
| ------------------------------ | ----------- |
| user_id                        | uuid pk     |
| default_priority_policy_json   | jsonb       |
| default_time_policy_json       | jsonb       |
| default_duration_policy_json   | jsonb       |
| default_health_thresholds_json | jsonb       |
| default_approval_rules_json    | jsonb       |
| created_at                     | timestamptz |
| updated_at                     | timestamptz |

## 4. Workflow Tables

### 4.1 `capture_items`

Purpose: raw input before interpretation.

| Column                   | Type             | Notes                                            |
| ------------------------ | ---------------- | ------------------------------------------------ |
| id                       | uuid pk          | generated                                        |
| user_id                  | uuid             | owner                                            |
| area_id                  | uuid nullable    | optional initial/inferred area                   |
| raw_text                 | text             | captured text/transcript                         |
| raw_audio_ref            | text nullable    | storage path if audio used                       |
| capture_mode             | text             | text, audio, import                              |
| inferred_area_confidence | numeric nullable | 0-1                                              |
| status                   | text             | new, parsed, triage_required, resolved, archived |
| created_at               | timestamptz      | generated                                        |

Indexes:

- `(user_id, created_at desc)`
- `(user_id, area_id)`
- `(user_id, status)`

---

### 4.2 `ambiguity_assessments`

Purpose: structured sense-making before planning.

| Column                  | Type          |
| ----------------------- | ------------- |
| id                      | uuid pk       |
| user_id                 | uuid          |
| area_id                 | uuid nullable |
| source_capture_item_id  | uuid          |
| likely_objective        | text          |
| problem_type            | text          |
| complexity_level        | text          |
| knowns_json             | jsonb         |
| unknowns_json           | jsonb         |
| assumptions_json        | jsonb         |
| constraints_json        | jsonb         |
| risks_json              | jsonb         |
| dependencies_json       | jsonb         |
| recommended_first_move  | text          |
| what_not_to_do_yet_json | jsonb         |
| confidence_score        | numeric       |
| review_trigger          | text          |
| created_at              | timestamptz   |

Notes:

- This table prevents ambiguity reasoning from being buried inside prompts.
- `problem_type` can be flexible text in V1; avoid premature enum lock-in.

---

### 4.3 `discovery_questions`

Purpose: track unknowns that need answers.

| Column         | Type                 |
| -------------- | -------------------- |
| id             | uuid pk              |
| user_id        | uuid                 |
| area_id        | uuid nullable        |
| source_type    | text                 |
| source_id      | uuid                 |
| question       | text                 |
| why_it_matters | text                 |
| answer_status  | text                 |
| answer_text    | text nullable        |
| created_at     | timestamptz          |
| resolved_at    | timestamptz nullable |

Statuses:

- open
- answered
- irrelevant
- deferred

---

### 4.4 `projects`

| Column      | Type          |
| ----------- | ------------- |
| id          | uuid pk       |
| user_id     | uuid          |
| area_id     | uuid          |
| title       | text          |
| description | text nullable |
| status      | text          |
| created_at  | timestamptz   |
| updated_at  | timestamptz   |

Statuses:

- active
- paused
- done
- dropped
- archived

Indexes:

- `(user_id, area_id, status)`

---

### 4.5 `tasks`

| Column                 | Type                 |
| ---------------------- | -------------------- |
| id                     | uuid pk              |
| user_id                | uuid                 |
| area_id                | uuid                 |
| project_id             | uuid nullable        |
| source_capture_item_id | uuid nullable        |
| title                  | text                 |
| description            | text nullable        |
| status                 | text                 |
| priority_score         | numeric nullable     |
| priority_confidence    | numeric nullable     |
| task_type              | text nullable        |
| energy_type            | text nullable        |
| estimated_minutes_low  | int nullable         |
| estimated_minutes_high | int nullable         |
| due_at                 | timestamptz nullable |
| definition_of_done     | text nullable        |
| first_tiny_step        | text nullable        |
| created_at             | timestamptz          |
| updated_at             | timestamptz          |

Statuses:

- draft
- active
- scheduled
- blocked
- done
- dropped
- archived

Indexes:

- `(user_id, area_id, status)`
- `(user_id, due_at)`
- `(user_id, project_id)`

---

### 4.6 `time_block_proposals`

Purpose: local schedule proposals before external calendar mutation.

| Column                | Type           |
| --------------------- | -------------- |
| id                    | uuid pk        |
| user_id               | uuid           |
| area_id               | uuid           |
| task_id               | uuid nullable  |
| proposed_start        | timestamptz    |
| proposed_end          | timestamptz    |
| rationale_json        | jsonb          |
| conflict_flag         | boolean        |
| conflict_details_json | jsonb nullable |
| status                | text           |
| created_at            | timestamptz    |

Statuses:

- proposed
- edited
- accepted
- rejected
- superseded

Indexes:

- `(user_id, area_id, status)`
- `(user_id, proposed_start)`

---

### 4.7 `calendar_blocks`

Purpose: app-owned scheduled blocks, optionally linked to Google Calendar.

| Column          | Type          |
| --------------- | ------------- |
| id              | uuid pk       |
| user_id         | uuid          |
| area_id         | uuid          |
| proposal_id     | uuid nullable |
| task_id         | uuid nullable |
| google_event_id | text nullable |
| start_at        | timestamptz   |
| end_at          | timestamptz   |
| status          | text          |
| created_at      | timestamptz   |
| updated_at      | timestamptz   |

Statuses:

- scheduled
- running
- completed
- missed
- cancelled

Indexes:

- `(user_id, area_id, status)`
- `(user_id, start_at)`
- `(user_id, google_event_id)`

---

### 4.8 `execution_sessions`

Purpose: actual work outcomes.

| Column              | Type          |
| ------------------- | ------------- |
| id                  | uuid pk       |
| user_id             | uuid          |
| area_id             | uuid          |
| task_id             | uuid nullable |
| calendar_block_id   | uuid nullable |
| planned_minutes     | int nullable  |
| actual_minutes      | int nullable  |
| paused_minutes      | int nullable  |
| distraction_minutes | int nullable  |
| productivity_rating | int nullable  |
| energy_rating       | text nullable |
| outcome             | text          |
| notes               | text nullable |
| created_at          | timestamptz   |

Outcome values:

- completed
- partial
- stopped
- distracted
- blocked
- skipped

---

### 4.9 `review_entries`

| Column       | Type          |
| ------------ | ------------- |
| id           | uuid pk       |
| user_id      | uuid          |
| area_id      | uuid nullable |
| review_type  | text          |
| period_start | date          |
| period_end   | date          |
| summary_json | jsonb         |
| created_at   | timestamptz   |

Review types:

- daily
- weekly

## 5. Meta-Learning Tables

### 5.1 `priority_profiles`

| Column               | Type                 |
| -------------------- | -------------------- |
| id                   | uuid pk              |
| user_id              | uuid                 |
| area_id              | uuid                 |
| declared_policy_json | jsonb                |
| learned_policy_json  | jsonb                |
| last_reviewed_at     | timestamptz nullable |
| updated_at           | timestamptz          |

---

### 5.2 `time_preference_profiles`

| Column                | Type                 |
| --------------------- | -------------------- |
| id                    | uuid pk              |
| user_id               | uuid                 |
| area_id               | uuid                 |
| declared_windows_json | jsonb                |
| learned_windows_json  | jsonb                |
| last_reviewed_at      | timestamptz nullable |
| updated_at            | timestamptz          |

---

### 5.3 `duration_profiles`

| Column              | Type        |
| ------------------- | ----------- |
| id                  | uuid pk     |
| user_id             | uuid        |
| area_id             | uuid        |
| task_type           | text        |
| estimate_stats_json | jsonb       |
| sample_count        | int         |
| last_updated_at     | timestamptz |

Indexes:

- `(user_id, area_id, task_type)`

---

### 5.4 `triage_learning_profiles`

| Column                     | Type        |
| -------------------------- | ----------- |
| id                         | uuid pk     |
| user_id                    | uuid        |
| area_id                    | uuid        |
| correction_patterns_json   | jsonb       |
| confidence_thresholds_json | jsonb       |
| updated_at                 | timestamptz |

---

### 5.5 `suggestion_records`

| Column          | Type                 |
| --------------- | -------------------- |
| id              | uuid pk              |
| user_id         | uuid                 |
| area_id         | uuid nullable        |
| suggestion_type | text                 |
| subject_type    | text                 |
| subject_id      | uuid nullable        |
| suggestion_json | jsonb                |
| confidence      | numeric nullable     |
| status          | text                 |
| created_at      | timestamptz          |
| resolved_at     | timestamptz nullable |

Statuses:

- pending
- accepted
- rejected
- ignored
- expired

---

### 5.6 `override_records`

| Column         | Type          |
| -------------- | ------------- |
| id             | uuid pk       |
| user_id        | uuid          |
| area_id        | uuid nullable |
| subject_type   | text          |
| subject_id     | uuid          |
| override_type  | text          |
| old_value_json | jsonb         |
| new_value_json | jsonb         |
| reason         | text nullable |
| created_at     | timestamptz   |

## 6. Health and Audit Tables

### 6.1 `health_checks`

| Column       | Type          |
| ------------ | ------------- |
| id           | uuid pk       |
| user_id      | uuid          |
| area_id      | uuid nullable |
| subsystem    | text          |
| status       | text          |
| score        | int           |
| details_json | jsonb         |
| checked_at   | timestamptz   |

Statuses:

- healthy
- watch
- critical

---

### 6.2 `health_incidents`

| Column        | Type                 |
| ------------- | -------------------- |
| id            | uuid pk              |
| user_id       | uuid                 |
| area_id       | uuid nullable        |
| subsystem     | text                 |
| severity      | text                 |
| incident_code | text                 |
| details_json  | jsonb                |
| status        | text                 |
| opened_at     | timestamptz          |
| closed_at     | timestamptz nullable |

---

### 6.3 `repair_guides`

| Column        | Type        |
| ------------- | ----------- |
| id            | uuid pk     |
| subsystem     | text        |
| incident_code | text        |
| guide_json    | jsonb       |
| version       | text        |
| created_at    | timestamptz |

---

### 6.4 `external_write_events`

Purpose: audit log for attempted or completed external writes. Phase 7B creates
the table but does not add Google API calls.

| Column               | Type          |
| -------------------- | ------------- |
| id                   | uuid pk       |
| user_id              | uuid          |
| area_id              | uuid nullable |
| provider             | text          |
| operation            | text          |
| target_type          | text          |
| target_id            | text nullable |
| request_summary_json | jsonb         |
| result_summary_json  | jsonb         |
| result_status        | text          |
| error_message        | text nullable |
| created_at           | timestamptz   |

---

### 6.5 `google_calendar_connections`

Purpose: server-owned Google Calendar connection state, including encrypted
server-only OAuth token material for later free/busy and approval-gated write
phases.

| Column                              | Type                 |
| ----------------------------------- | -------------------- |
| id                                  | uuid pk              |
| user_id                             | uuid unique          |
| provider                            | text                 |
| calendar_id                         | text                 |
| encrypted_access_token              | text nullable        |
| encrypted_refresh_token             | text nullable        |
| granted_scopes_json                 | jsonb                |
| status                              | text                 |
| first_write_warning_acknowledged_at | timestamptz nullable |
| connected_at                        | timestamptz nullable |
| disconnected_at                     | timestamptz nullable |
| token_expires_at                    | timestamptz nullable |
| token_type                          | text nullable        |
| created_at                          | timestamptz          |
| updated_at                          | timestamptz          |

Statuses:

- metadata_only
- connected
- disconnected
- error

Notes:

- Token ciphertext must remain server-only and never appear in client payloads.
- `metadata_only` remains the downgrade state for older rows that were created
  before encrypted token storage existed.

Indexes:

- `(user_id)`
- `(user_id, status)`

---

### 6.6 `ai_recommendations`

| Column              | Type             |
| ------------------- | ---------------- |
| id                  | uuid pk          |
| user_id             | uuid             |
| area_id             | uuid nullable    |
| prompt_version      | text             |
| schema_version      | text             |
| recommendation_type | text             |
| input_summary_json  | jsonb            |
| output_json         | jsonb            |
| confidence          | numeric nullable |
| created_at          | timestamptz      |

---

### 6.7 `user_decisions`

| Column              | Type          |
| ------------------- | ------------- |
| id                  | uuid pk       |
| user_id             | uuid          |
| area_id             | uuid nullable |
| decision_type       | text          |
| subject_type        | text          |
| subject_id          | uuid nullable |
| decision_value_json | jsonb         |
| created_at          | timestamptz   |

## 7. Relationship Summary

```text
users
  └─ areas
      ├─ projects
      │   └─ tasks
      ├─ capture_items
      │   ├─ ambiguity_assessments
      │   └─ discovery_questions
      ├─ time_block_proposals
      │   └─ calendar_blocks
      ├─ execution_sessions
      ├─ review_entries
      ├─ priority_profiles
      ├─ time_preference_profiles
      ├─ duration_profiles
      └─ health_checks
```

## 8. RLS Policy Pattern

For every user-owned table:

```sql
-- SELECT
using ((select auth.uid()) = user_id)

-- INSERT
with check ((select auth.uid()) = user_id)

-- UPDATE
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id)

-- DELETE
using ((select auth.uid()) = user_id)
```

V1 can avoid hard deletes in the UI and rely on archive/status fields.

## 9. Migration Order

1. create extensions if needed
2. create `areas`
3. create `global_defaults`
4. create capture/sense-making tables
5. create projects/tasks
6. create proposals/calendar blocks
7. create execution/review tables
8. create meta-learning tables
9. create health/audit tables
10. add indexes
11. enable RLS
12. add RLS policies
13. seed default areas and global defaults

## 10. Ambiguity and planning-theatre guardrails

Ambiguity-related persistence must keep assumptions and first-wave planning visible instead of burying them in prompt text. V1 can represent the first reversible move, review trigger, and what-not-to-do-yet guidance on `ambiguity_assessments`; if future work needs multiple first-wave actions or assumption lifecycle tracking, add explicit user-owned tables or fields with RLS, export coverage, and validation instead of storing opaque AI prose.

Do not add `first_wave_plans` or `assumption_logs` as standalone tables without a separate approved implementation issue covering migration, UI behavior, parser output, export coverage, RLS, and tests.

## 11. Future project/task state guardrails

Use the smallest state machine that supports action.

Guardrails for the future operating-layer upgrade:

- status controls workflow
- metadata explains nuance
- project status and task status stay conceptually separate
- `backlog` is the approved deferred task status for Someday/later cockpit triage; it changes workflow behavior by keeping an accepted task out of today's planning queue until the user promotes it
- prefer fields such as `stuck_reason`, `waiting_on_person_id`, `paused_reason`, `completed_at`, `cancelled_at`, and `archived_at` before adding many new statuses
- avoid state explosion and fake precision; if a new status does not clearly change behavior, it probably belongs in metadata instead
- any task/project status expansion requires a separate approved T3 issue or spec that covers migration, UI, parser, tests, and review behavior
- if a future transition writes more than one table, it must use one transactional `SECURITY INVOKER` RPC per `docs/ENGINEERING_INVARIANTS.md` INV-1
- any new user-owned table or state-adjacent table remains subject to export coverage (INV-2), RLS, and two-user isolation tests

## 12. Open Questions

- Should `area_id` be nullable on `capture_items` only, or also on ambiguous assessments?
- Should deleted tasks be hard-deletable for privacy, or only archived in V1?
- Should raw audio be stored after transcription, or deleted immediately?
- Should `task_type` be free text initially, or controlled vocabulary?
- Should policy JSON be versioned in a separate table from day one?

Recommended V1 answers:

- `area_id` nullable only where classification may be unresolved.
- Soft archive operational objects; add hard delete/export later.
- Delete raw audio after transcription unless user opts into storage.
- Keep `task_type` as text initially.
- Add simple version fields for policy/schemas, but avoid complex versioning system.

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
