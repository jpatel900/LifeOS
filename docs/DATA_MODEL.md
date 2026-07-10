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
  ├─ review_entries
  ├─ people (target, S1)
  ├─ operator_profiles (target, S2)
  └─ win_records (target, S7)

Meta-Learning
  ├─ priority_profiles
  ├─ time_preference_profiles
  ├─ duration_profiles
  ├─ triage_learning_profiles
  ├─ suggestion_records
  ├─ override_records
  └─ rollup_summaries (target, S8)

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

---

### 4.10 `people` (target shape, Stage 1 slice S1)

Status: not yet implemented. Recorded here as the frozen Stage 1 contract per NS-INV-2; slice S1 creates this table exactly as specified, later slices only add.

Purpose: user-scoped person records for waiting-on / committed-to tracking.

| Column          | Type                 | Notes                              |
| --------------- | -------------------- | ---------------------------------- |
| id              | uuid pk              | generated                          |
| user_id         | uuid                 | owner                              |
| display_name    | text                 | not null                           |
| normalized_name | text                 | not null; lowercased, for matching |
| notes           | text nullable        |                                    |
| created_at      | timestamptz          | generated                          |
| updated_at      | timestamptz          | generated                          |
| archived_at     | timestamptz nullable | soft delete                        |

Standard owner RLS (section 8). Export coverage required (INV-2).

---

### 4.11 `tasks` — additive columns (target shape, Stage 1 slice S1)

Status: not yet implemented. Adds to the existing `tasks` table (section 4.5) without altering or renaming any existing column, per NS-INV-2.

| Column                 | Type                 | Notes                  |
| ---------------------- | -------------------- | ---------------------- |
| waiting_on_person_id   | uuid nullable        | fk `people`            |
| waiting_on_since       | timestamptz nullable |                        |
| is_commitment          | boolean              | not null default false |
| committed_to_person_id | uuid nullable        | fk `people`            |

Commitment due date reuses the existing `due_at` field rather than adding a new date column, consistent with the "prefer fields over new statuses" guardrail (section 11). `waiting_on_person_id` was already anticipated in that guardrail's example field list.

---

### 4.12 `operator_profiles` (target shape, Stage 1 slice S2)

Status: not yet implemented.

Purpose: single global operator profile (named strengths/weaknesses with compensation rules), consumed by the NS-INV-1 context-assembly module.

| Column             | Type           | Notes                           |
| ------------------ | -------------- | ------------------------------- |
| id                 | uuid pk        | generated                       |
| user_id            | uuid           | not null, unique                |
| profile_text       | text nullable  |                                 |
| compensation_rules | jsonb nullable | zod: array of `{ trait, rule }` |
| created_at         | timestamptz    | generated                       |
| updated_at         | timestamptz    | generated                       |

Owner RLS (section 8). Export coverage required (INV-2).

`areas` also gains additive columns in slice S2 (target shape): `charter_text` (text nullable) and `charter_updated_at` (timestamptz nullable), extending the existing `areas` table (section 3.1) without altering existing columns.

---

### 4.13 `win_records` (target shape, Stage 1 slice S7)

Status: not yet implemented.

Purpose: user-confirmed wins harvested from completions during weekly review (FR-020).

| Column            | Type          | Notes               |
| ----------------- | ------------- | ------------------- |
| id                | uuid pk       | generated           |
| user_id           | uuid          | owner               |
| area_id           | uuid          | fk `areas`          |
| source_task_id    | uuid nullable |                     |
| source_project_id | uuid nullable |                     |
| title             | text          | not null            |
| detail            | text nullable |                     |
| occurred_at       | date          | not null            |
| review_entry_id   | uuid nullable | fk `review_entries` |
| created_at        | timestamptz   | generated           |

Owner RLS (section 8). Export coverage required (INV-2).

---

### 4.14 Constraint layer — additive target shapes (FR-022..FR-026)

Status: not yet implemented. All additive per NS-INV-2; no new tables.

| Table              | Column        | Type                                              | Notes                                                                            |
| ------------------ | ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| tasks              | is_reversible | boolean nullable                                  | FR-024; meaningful only when `task_type = 'decision'` (deadline reuses `due_at`) |
| capture_items      | return_hook   | text nullable                                     | FR-026; what the user returns to after the capture resolves                      |
| execution_sessions | cap_outcome   | text nullable, check in (`cut_scope`, `deferred`) | FR-025; recorded when the DoD-cap state machine fires                            |

WIP enforcement (FR-022) adds no columns: the committed-for-execution count is derived from existing scheduling/execution state, and refusals/swaps are recorded through the section 5 suggestion/override vocabulary with stable policy ids (`wip_enforcement.v1`, `dod_cap.v1`).

### 4.15 Daily-driver floor — additive target shapes (FR-027..FR-030)

Status: not yet implemented. All additive per NS-INV-2; no new tables preferred — re-entry events ride the existing section 5 suggestion/override vocabulary rather than a dedicated table.

| Table         | Column            | Type                           | Notes                                                                                                                       |
| ------------- | ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| capture_items | client_capture_id | text nullable, unique per user | FR-027; client-generated id set by the offline queue so a reconnect-triggered sync is idempotent (dedupes replayed inserts) |

`re_entry.v1` (FR-028) is recorded through the existing section 5 suggestion/override record vocabulary — the absence, each auto-deferral, and the single recovery-proposal's resolution are logged with that policy id; no new column or table is added for it. Auto-deferral itself is a status transition on the existing scheduled-block state (no new column beyond what scheduling already tracks), reversible and enumerated in the "while you were out" summary per FR-028.

FR-029 (persistence truth + session longevity) and FR-030 (provider canary + mock-first auto-degrade) add no schema: FR-029 reuses the existing `provider === "mock"` signal (section 6 health tables / `workflow.ts`) and the Supabase client's own session store; FR-030 reads the existing `ai_call_traces` table (`latency_ms`, `status`) added for the constraint layer's parse-service instrumentation and writes no new columns.

### 4.16 Task-Map v1 (FR-031) — additive shape sketch

**PROPOSED — lands with the v1 build, not this PR.** This subsection sketches the shape FR-031 will need; it is not a frozen target-shape contract like 4.10-4.15 and does not authorize a migration on its own. A build slice still needs its own approved issue, migration, RLS, export coverage, and tests per section 11's guardrail.

Purpose: nodes are nodes of the existing `tasks` table (no parallel node model); a new additive `task_edges` table carries the DAG's dependency/branch/merge edges; node-role annotations distinguish required, optional, and red (do-not/only-if) nodes.

`tasks` — additive columns (sketch):

| Column        | Type                                                    | Notes                                                                               |
| ------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| node_role     | text nullable, check in (`required`, `optional`, `red`) | null when the task carries no map; FR-031 §(c)/(d) caps enforced in code + schema   |
| red_reason    | text nullable                                           | required when `node_role = 'red'`; the cited reason for the do-not/only-if guidance |
| red_condition | text nullable                                           | optional; the condition under which a red node becomes allowed                      |

`task_edges` (sketch, additive new table):

| Column          | Type        | Notes                                                                |
| --------------- | ----------- | -------------------------------------------------------------------- |
| id              | uuid pk     | generated                                                            |
| user_id         | uuid        | owner (owner-scoped, like `people`/`operator_profiles` in 4.10/4.12) |
| task_id         | uuid        | fk `tasks`; the map/DAG this edge belongs to                         |
| from_node_order | integer     | source node within the task's map                                    |
| to_node_order   | integer     | target node within the task's map (enables branching/merging edges)  |
| created_at      | timestamptz | generated                                                            |

Standard owner RLS (section 8), same pattern as sibling additive tables — no bespoke policy shape. Export coverage required (INV-2) in the creating PR. v1 caps (FR-031: ≤7 required + ≤4 optional nodes, one level of branching, ≤2 red nodes) are enforced in the strict schema and in code, not by this sketch's column shape alone.

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

---

### 5.7 `rollup_summaries` (target shape, Stage 1 slice S8)

Status: implemented (slice S8). Weekly rollups shipped with S8's end-to-end
surface; the monthly surface (Close-moment card, approve/dismiss,
month-over-month readback composed from approved weekly rollups) landed
2026-07-10 via issue #486 — both period types persist through the same
`createRollupSummary` path described here.

Purpose: AI-drafted weekly/monthly rollups per area (FR-020). Only approved rollups persist; drafts live in the UI only (NS-INV-4).

| Column       | Type        | Notes                                     |
| ------------ | ----------- | ----------------------------------------- |
| id           | uuid pk     | generated                                 |
| user_id      | uuid        | owner                                     |
| area_id      | uuid        | fk `areas`                                |
| period_type  | text        | check in (`week`, `month`)                |
| period_start | date        |                                           |
| period_end   | date        |                                           |
| summary      | jsonb       | zod: `highlights[]`, `misses[]`, `counts` |
| created_at   | timestamptz | generated                                 |

Constraints: unique `(user_id, area_id, period_type, period_start)`.

Owner RLS (section 8). Export coverage required (INV-2).

---

### 5.8 Parse-result schema extension (target shape, Stage 1 slice S3)

Status: implemented (slice S3, issue #255). Versioned addition to the existing parse-result schema in `packages/schemas`, per draft: optional `person_mentions` — array of `{ name, role: waiting_on | committed_to | mention, confidence }` — plus an `is_commitment` boolean, both added to `task_draft`. Both default (`[]` / `false`) so pre-S3 parse results still validate; strict JSON-schema and zod contracts stay in lockstep. Prompt bumped to `parse_capture.v3`; `schema_version` stays `1.0` (additive optional, following the `breakdown` precedent).

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
  ├─ people (target, S1)
  ├─ operator_profiles (target, S2)
  └─ areas
      ├─ projects
      │   └─ tasks (target additive: waiting_on_person_id, committed_to_person_id -> people, S1)
      ├─ capture_items
      │   ├─ ambiguity_assessments
      │   └─ discovery_questions
      ├─ time_block_proposals
      │   └─ calendar_blocks
      ├─ execution_sessions
      ├─ review_entries
      │   └─ win_records (target, S7)
      ├─ priority_profiles
      ├─ time_preference_profiles
      ├─ duration_profiles
      ├─ rollup_summaries (target, S8)
      └─ health_checks
```

Target-shape entries above are Stage 1 contract tables/columns not yet implemented (see sections 4.10-4.13, 5.7); they are listed here so the relationship graph stays a single source of truth once slices land.

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

This pattern applies unchanged to all Stage 1 target-shape tables (`people`, `operator_profiles`, `win_records`, `rollup_summaries`): standard owner RLS, no bespoke policy shape, export coverage from the same PR that creates the table (INV-2).

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

Stage 1 target-shape tables slot into this order by dependency, not by appending at the end: `people` after step 5 (tasks reference it), `operator_profiles`/`areas` charter columns after step 3, `win_records` after step 7 (references review_entries), `rollup_summaries` after step 8. Each slice adds its own indexes/RLS/policies for its tables in the same step shape as steps 10-12.

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

Stage 1 aging defaults (target, slice S4): waiting-on is flagged after 3 days, using the existing `global_defaults` pattern for a per-area override; commitment aging uses the identical default and override mechanism.

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
