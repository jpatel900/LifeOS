# TEST_PLAN.md

# Test Plan — Area-Scoped Personal Workflow Cockpit

## 1. Test Strategy

The app must be tested around four risks:

1. data loss
2. unsafe external writes
3. AI output invalidity
4. privacy/security errors

The test strategy favors practical coverage over perfection. V1 is the shipped baseline; every later slice retains these invariant checks and adds focused proof for its new contract under ADR 0005. Since the Final UX Loop (2026-07), experience criteria are pinned the day they pass (program rule R3): a pinned criterion cannot silently regress, and a campaign closes only by fresh-eyes re-score, never by checklist.

## 2. Test Types and Tiers

Volatile facts in this section are as of 2026-08; the CI workflow (`.github/workflows/ci.yml`) is the authority if they drift.

| Tier                              | Runner                                                                                                           | What it proves                                                                                                                       | Cannot prove                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Unit (Vitest, `pnpm test`)        | jsdom, no network                                                                                                | Pure logic, schemas, state transitions, reducer truth, and the guard tests (§6.1)                                                    | Anything about the running app in a browser |
| E2E device tier                   | Playwright msedge, dev server, demo/mock mode (no Supabase env)                                                  | Shell truth without an account: moments/URL contract, history walks, reachability, hit targets, device-journal durability, a11y pins | Account readback, RLS, real auth            |
| E2E signed-in tier (`@signed-in`) | Same runner + local Supabase (`supabase db reset`, migrations + seed), `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` set | What the browser's own JWT actually persisted: Postgres readbacks, replay dedupe against real rows, cross-tier account truth         | Production behavior                         |
| Migrations + RLS                  | Fresh local Supabase, all migrations from scratch, two seeded users                                              | Schema applies cleanly; users see only their own rows                                                                                | Browser-level flows                         |
| Weekly production smoke           | Scheduled workflow, secrets-gated                                                                                | The authenticated golden journey + CLI consumer smoke against the real deployment                                                    | Anything between weekly runs                |
| Provider canary                   | Scheduled probe that signs in                                                                                    | The AI provider path answers; classifies healthy/failing/misconfigured; opens an incident issue only on a healthy→failing transition | Non-provider subsystems                     |

Branch protection requires Monorepo Validation, Playwright E2E, and Migrations + RLS Verification. When main goes red twice, the Main Red Guard opens a HELD, diagnosed revert PR — it never merges by itself (notify-and-hold, owner decision 2026-08-05). CI is the integration truth; cross-lane coordination promises are not.

## 3. Critical Invariants

These must never break:

1. Raw captures are not lost if AI fails.
2. AI output is never persisted as committed objects unless validated.
3. No external calendar write happens without explicit user approval.
4. Every external write is audit-logged (`external_write_events`).
5. User can only access own data.
6. Area-scoped records cannot cross-contaminate another user's data.
7. Failed calendar writes do not mark blocks as scheduled.
8. Health scores are deterministic (rule-based, never AI-invented).
9. Core policies are not changed without approval.
10. Calendar tokens/secrets never reach frontend logs.
11. Multi-table workflow transitions commit atomically or not at all (INV-1).
12. Every user-owned table is export-covered or on the documented secrets exclusion list (INV-2).
13. Capture content is data, never instructions (INV-8 containment).
14. Durable device writes replay idempotently — a replayed journal entry never duplicates a row (the `client_write_id` family, `docs/DATA_MODEL.md` §4.18).

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

### 4.2 Scope Resolver

Test:

```text
item override beats area policy
area policy beats global default
global default used when no area policy
missing policy produces safe fallback
```

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

### 4.4 Duration Estimation

Test:

- actual duration updates profile
- zero/negative values rejected
- manual override logged
- estimates returned as ranges
- insufficient sample count returns low confidence

## 5. Integration Tests

The route handlers below are API surfaces under `/api` (and the versioned `/api/v1` client contract, ADR 0006). Their UI lives in the moments shell (see `docs/UX_FLOWS.md`); these contracts are surface-independent.

### 5.1 `parse_capture`

Test:

- raw capture persists before AI call
- valid AI response creates drafts
- invalid AI response creates recoverable error
- low-confidence area routes to triage
- ambiguous capture creates ambiguity assessment
- first move is generated for high-ambiguity input
- unauthenticated calls are rejected (the auth gate is deliberate)

### 5.2 `triage_apply`

Test:

- accept creates task
- reject does not create task
- edit persists modified task
- reassign area changes area
- correction log created
- invalid draft ID rejected

### 5.3 `propose_blocks`

Test:

- creates local proposal
- does not write to Google Calendar
- uses duration range
- uses area time preference
- handles no calendar connected
- handles free/busy failure gracefully

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

### 5.5 `mark_block_result`

Test:

- completed block creates execution session
- missed block updates status
- distraction minutes saved
- productivity rating bounded 1-5
- duration profile updates
- area-scoped learning only

### 5.6 `health_check`

Test:

- AI failure detected
- calendar token failure detected
- DB connectivity check works
- health scores are rule-based
- incidents created once, not duplicated endlessly
- closed incident stays closed unless failure recurs

## 6. RLS, Security, and Guard Tests

### 6.1 Guard tests (sacred — never weakened to make a change pass)

The repo's convergence mechanism is guards that fail loudly. As of 2026-08 the standing families:

- plain-language guard (UX copy stays simple — the strict-equality pin that provably converges copy debt to zero)
- route allowlist + legacy route redirects (the C2 one-shell pin)
- source-of-truth reachability: tests build `WorkflowState` only via `workflowSeed()` + transition helpers; the repo-wide Semgrep rule `no-workflowstate-annotation-in-tests` enforces it (grandfather list emptied 2026-08-24, #859)
- Semgrep `zod-datetime-requires-offset` (the gap that silently killed calendar integration once)
- both Semgrep CI jobs carry vacuous-pass guards: zero files scanned fails the job
- docRegistry (no session-note files), serverTimestampCoverage, engineeringInvariants page budgets (empty grandfather list), iconMetadata, decidedPolicyKeys
- C1 Trust pins: per-surface phrase guards, session write-at-end, capture status, daily-close idempotency (DB + e2e), grants static guard, five-noun durability pins including the signed-in Playwright tier
- C2 pins: `tests/e2e/nav-truth.spec.ts` (history walks, ≤2-interaction matrix, deep-link composition)

### 6.2 RLS tests

Use at least two test users.

Test:

- User A cannot select User B areas
- User A cannot select User B tasks
- User A cannot update User B proposal
- User A cannot insert row with User B `user_id`
- User A cannot access User B health rows
- service-role usage limited to server-side functions only
- frontend never receives service-role key
- transactional RPCs (`accept_time_block_proposal`, `place_time_block`, `apply_execution_session_outcome`) deny cross-user calls and enforce status guards
- any new transactional RPC ships a two-user denial test and an invalid-state test in the same PR

Acceptance criteria:

- every public table has RLS enabled
- every user-owned table has select/insert/update/delete policies
- all RLS tests pass before deployment

## 7. E2E Tests

Two browser tiers split the proof (§2): the device tier proves the shell's truth without an account; the signed-in tier proves the account actually holds what the screen claimed. A criterion is fully pinned when the appropriate tier holds it.

### 7.1 Golden journey (happy path)

```text
sign in (or demo mode)
→ capture a thought (overlay, key `c`)
→ triage accept in the Triage sheet
→ plan/place on the rail in the Plan sheet
→ approval-gated calendar write (mock adapter; real Google only in manual/prod smoke)
→ run the block in the Flow moment
→ complete with an outcome in the Close moment
→ close the day, see the verdict
```

Acceptance criteria:

- flow completes without direct DB editing
- no unexpected page crash
- all created records have correct `user_id` and `area_id`
- external write log exists
- every step's state change is URL-visible; Back/Forward never leaves the shell

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

### 7.3 Missed Block Recovery — CONTRACT ONLY, UNBUILT

This journey is the FR-012 contract (frozen behind the Final UX Loop per KNOWN_ISSUES row 1; update/reschedule of app-created events does not exist yet). When built, it must prove:

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

### 7.4 Standing E2E families (the pins that must stay green)

Named families, not a file inventory — `apps/web/tests/e2e/` is the truth if this drifts (as of 2026-08):

- nav-truth: URL truth, history walks, ≤2-interaction matrix, deep-link composition (C2 card pins)
- moments-home-parity: the home renders the moments design language on both viewports
- hit-targets-390 + overlap pin: no target under 44px, no overlaps, at 390px
- close-day-verdict: closing the day shows a verdict; further closes are idempotent
- durable-wins-reviews, durable-plans-drafts: device-journal replay dedupes; copy tells the persistence truth
- cockpit-google-approval: the approval bridge survives the port
- a11y-axe-pin: axe at AA on the covered surfaces

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

### 8.1 Context-assembly charter/profile fixtures (NS-INV-1, slice S2)

Per-area fixtures exercise the single context-assembly choke point
(`apps/web/src/lib/ai/contextAssembly.ts`) with charter and operator-profile
context present and absent. Structural expectations only — never assert exact
prompt wording beyond the presence/absence markers below.

Fixtures:

1. area context, charter absent (empty/whitespace/null)
2. area context, charter present on one area
3. operator profile absent
4. operator profile present (profile text and/or compensation rules)

Assertions:

- empty charter AND empty profile => assembled messages are byte-identical to
  the pre-slice baseline (parity is proven, not eyeballed)
- a present charter adds an "Area charters:" block scoped to the chartered
  area's slug; areas without a charter never appear in that block
- a present operator profile adds an "Operator profile:" block; each
  compensation rule renders its trait and rule
- the system prompt and `prompt_version` are unchanged whether or not charter
  or profile context is supplied

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

The owner's scripted real-use hour (U3) is the program's experience gate: no automated tier substitutes for it (Final UX Loop, Phase F key 2).

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
- [ ] no guard test, validator, schema, or RLS policy weakened to make a change pass

## 12. Test Data

Seed (`supabase/seed.sql`):

- User A, User B (local Auth users for the signed-in tier)
- Areas: Main Job, Personal, Volunteer Work, Side Project (per-user starter areas)
- Tasks: simple task, vague project-like task, scheduled task, missed block
- Profiles: default time preference, default priority profile
- Health: healthy auth, failed calendar connector

## 13. Definition of Done

A feature is done only when:

- user-facing flow works
- data model migration exists
- RLS policy exists if table added
- the AGENTS.md validation floor passes (`pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`)
- integration tests pass where applicable
- AI output schema validates
- error state is visible
- acceptance criteria are met
- new experience criteria are pinned the day they pass (program R3)
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
