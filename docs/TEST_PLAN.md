# TEST_PLAN.md

# Test Plan — Area-Scoped Personal Workflow Cockpit

## 1. Test Strategy

The app must be tested around four risks:

1. data loss
2. unsafe external writes
3. AI output invalidity
4. privacy/security errors

The V1 test strategy should favor practical coverage over perfection.

## 2. Test Types

| Test Type          | Purpose                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Unit tests         | Pure logic, schema validation, state transitions                                                   |
| Integration tests  | Next.js Route Handlers / Server Actions (and Edge Functions if adopted), database writes, adapters |
| RLS/security tests | Verify users can only access their own rows                                                        |
| AI contract tests  | Validate schemas and fallback handling                                                             |
| E2E tests          | Core user flows                                                                                    |
| Manual smoke tests | Calendar OAuth/write behavior                                                                      |
| Regression tests   | Prevent future agent changes from breaking invariants                                              |

## 3. Critical Invariants

These must never break:

1. Raw captures are not lost if AI fails.
2. AI output is never persisted as committed objects unless validated.
3. No external calendar write happens without explicit user approval.
4. Every external write is audit-logged.
5. User can only access own data.
6. Area-scoped records cannot cross-contaminate another user's data.
7. Failed calendar writes do not mark blocks as scheduled.
8. Health scores are deterministic.
9. Core policies are not changed without approval.
10. Calendar tokens/secrets never reach frontend logs.
11. Multi-table workflow transitions commit atomically or not at all (see `docs/ENGINEERING_INVARIANTS.md` INV-1).
12. Every user-owned table is export-covered or on the documented secrets exclusion list (INV-2).

## 4. Unit Tests

### 4.1 Schema Validation

Test schemas:

- `ParseCaptureResponse`
- `AmbiguityAssessmentResponse`
- `TriageSuggestionResponse`
- `BlockProposalResponse`
- `WeeklyReviewResponse`
- `PolicySuggestionResponse`
- `HealthNarrativeResponse`

Cases:

- valid minimal response
- valid full response
- missing required key
- invalid enum/status
- extra unexpected key if strict mode used
- invalid date
- invalid confidence score
- empty required array
- hallucinated area ID

Acceptance criteria:

- invalid output fails validation
- validation error is user-recoverable
- invalid output is not committed

---

### 4.2 Scope Resolver

Test:

```text
item override beats area policy
area policy beats global default
global default used when no area policy
missing policy produces safe fallback
```

---

### 4.3 State Machines

Test valid/invalid transitions.

Capture:

- new → parsed
- parsed → triage_required
- triage_required → resolved
- resolved → archived

Task:

- draft → active
- active → scheduled
- scheduled → done
- active → dropped

Proposal:

- proposed → accepted
- proposed → rejected
- accepted cannot be accepted again

Calendar block:

- scheduled → running
- running → completed
- scheduled → missed
- completed cannot become running

---

### 4.4 Duration Estimation

Test:

- actual duration updates profile
- zero/negative values rejected
- manual override logged
- estimates returned as ranges
- insufficient sample count returns low confidence

## 5. Integration Tests

### 5.1 `parse_capture`

Test:

- raw capture persists before AI call
- valid AI response creates drafts
- invalid AI response creates recoverable error
- low-confidence area routes to triage
- ambiguous capture creates ambiguity assessment
- first move is generated for high-ambiguity input

---

### 5.2 `triage_apply`

Test:

- accept creates task
- reject does not create task
- edit persists modified task
- reassign area changes area
- correction log created
- invalid draft ID rejected

---

### 5.3 `propose_blocks`

Test:

- creates local proposal
- does not write to Google Calendar
- uses duration range
- uses area time preference
- handles no calendar connected
- handles free/busy failure gracefully

---

### 5.4 `approve_calendar_write`

Test with mock calendar adapter first:

- requires proposal ID
- requires explicit approval flag
- writes event only once
- stores provider event ID
- logs external write
- failure does not mark scheduled
- duplicate approval is prevented

Manual test with real Google Calendar only after mocks pass.

---

### 5.5 `mark_block_result`

Test:

- completed block creates execution session
- missed block updates status
- distraction minutes saved
- productivity rating bounded 1-5
- duration profile updates
- area-scoped learning only

---

### 5.6 `health_check`

Test:

- AI failure detected
- calendar token failure detected
- DB connectivity check works
- health scores are rule-based
- incidents created once, not duplicated endlessly
- closed incident stays closed unless failure recurs

## 6. RLS and Security Tests

Use at least two test users.

Test:

- User A cannot select User B areas
- User A cannot select User B tasks
- User A cannot update User B proposal
- User A cannot insert row with User B `user_id`
- User A cannot access User B health rows
- service-role usage limited to server-side functions only
- frontend never receives service-role key
- transactional RPCs (`accept_time_block_proposal`, `apply_execution_session_outcome`) deny cross-user calls and enforce status guards
- any new transactional RPC ships a two-user denial test and an invalid-state test in the same PR

Acceptance criteria:

- every public table has RLS enabled
- every user-owned table has select/insert/update/delete policies
- all RLS tests pass before deployment

## 7. E2E Tests

### 7.1 Happy Path Vertical Slice

```text
Create area
→ capture text
→ parse into task
→ accept task
→ propose block
→ approve local proposal
→ write calendar event with mock adapter
→ execute block
→ complete session
→ view review
→ view health
```

Acceptance criteria:

- flow completes without direct DB editing
- no unexpected page crash
- all created records have correct `user_id` and `area_id`
- external write log exists

---

### 7.2 Ambiguous Task Flow

```text
capture ambiguous project
→ sense-making assessment
→ create discovery questions
→ convert first move into task
→ schedule first move
→ execute
→ review assumption
```

Acceptance criteria:

- AI does not create fake full plan as committed tasks
- unknowns remain visible
- first move is small and reversible

---

### 7.3 Missed Block Recovery

```text
scheduled block
→ mark missed
→ choose reschedule
→ proposal generated
→ edit proposal
→ approve calendar update
```

Acceptance criteria:

- missed state persists
- new proposal references old block/task
- no external write occurs before approval

## 8. AI Contract Tests

Use fixture inputs and expected structural properties, not exact wording.

Fixtures:

1. simple task
2. ambiguous project
3. multi-area capture
4. emotional/overwhelmed capture
5. task with deadline
6. task with blocker
7. task too vague to schedule
8. capture with irrelevant noise

Assertions:

- output validates schema
- confidence exists
- area inference exists or triage required
- ambiguity creates unknowns
- exact fake timelines are not produced for vague work
- "what not to do yet" appears for ambiguous work
- first move exists for ambiguous work
- no unsupported external action is suggested as already done
- ambiguous planning output includes a review trigger and what-not-to-do-yet guidance

## 9. Manual Test Checklist

Before using real production calendar:

- [ ] RLS tests pass
- [ ] mock calendar tests pass
- [ ] OAuth consent screen reviewed
- [ ] scopes are minimal
- [ ] event write creates correct title/time
- [ ] duplicate write prevention works
- [ ] failed write is visible
- [ ] audit record is created
- [ ] disconnect calendar path works

## 10. Performance / Cost Tests

Track:

- average capture parse latency
- average proposal generation latency
- AI token usage per function
- number of AI calls per workflow
- number of background jobs
- calendar API failures

V1 targets:

- simple text capture parse: acceptable interactive latency
- no more than one AI call for simple parse
- no background job required for core workflow
- no web search calls in app runtime
- no vector DB dependency

## 11. Regression Gate for AI Coding Agents

Before merging any agent-generated change:

- [ ] tests pass
- [ ] no new external write path without approval
- [ ] no RLS disablement
- [ ] no service-role key in frontend
- [ ] no hardcoded model names unless approved
- [ ] no new background job without documented reason
- [ ] no schema change without migration + test
- [ ] no prompt change without schema/fixture validation
- [ ] no feature added from explicit non-goals list

## 12. Test Data

Seed:

- User A
- User B
- Areas:
  - Main Job
  - Personal
  - Volunteer Work
  - Side Project
- Tasks:
  - simple task
  - vague project-like task
  - scheduled task
  - missed block
- Profiles:
  - default time preference
  - default priority profile
- Health:
  - healthy auth
  - failed calendar connector

## 13. Definition of Done

A feature is done only when:

- user-facing flow works
- data model migration exists
- RLS policy exists if table added
- unit tests pass
- integration tests pass where applicable
- AI output schema validates
- error state is visible
- acceptance criteria are met
- documentation is updated
- AGENTS.md rules are not violated

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
