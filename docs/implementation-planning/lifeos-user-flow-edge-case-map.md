# LifeOS User Flow and Edge Case Map

Status: Planning map for implementation, QA, and product review
Purpose: List the ways a person can move through LifeOS, including failure and edge cases, so UI/UX work does not only cover the happy path
Read when: Adding workflow behavior, writing E2E tests, reviewing cockpit UX, or deciding what persistence work comes next
Do not use for: Replacing `REQUIREMENTS.md`, `UX_FLOWS.md`, `SECURITY_PRIVACY.md`, or `TEST_PLAN.md`

## 1. Non-Negotiable Flow Rules

- Raw capture is saved before AI parsing or organization work.
- AI creates drafts and suggestions, not committed work, until the user accepts.
- Google Calendar writes require a final explicit user action.
- Area context stays visible, but unresolved area is allowed during capture and triage.
- Local workflow remains usable when account sync, AI, or Google Calendar is unavailable.
- Missed work uses recovery language, not failure language.
- Health explains system problems separately from user workflow state.
- Admin work stays outside the cockpit unless it directly supports the current action.

## 2. Canonical Navigation Graph

```text
Unauthenticated
  -> Login
  -> First-time setup or existing account load
  -> Today

Today
  -> Capture
  -> Triage
  -> Plan
  -> Execute
  -> Review
  -> Health
  -> All areas overview
  -> Settings / Areas admin

Capture
  -> Triage
  -> Today

Triage
  -> Do today -> Plan
  -> Someday -> All areas / backlog
  -> Drop -> Triage next item or Today
  -> Edit / reassign -> Triage current item

Plan
  -> Local block -> Execute
  -> Google approval disclosure -> Google Calendar write -> Execute
  -> Unplanned backlog -> Triage or All areas

Execute
  -> Completed / stopped / stuck / distracted / missed
  -> Review
  -> Capture side thought without losing session

Review
  -> Carry forward -> Plan
  -> Drop / defer -> All areas
  -> Save review -> Today

Health
  -> Fix account / database / AI / calendar issue
  -> Return to current workflow

Settings / Areas admin
  -> Create / recolor / archive area
  -> Connect / disconnect Google Calendar
  -> Export data
  -> Return to cockpit
```

## 3. User Modes

| Mode                             | What the person sees                                    | Required behavior                                                      |
| -------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Not signed in                    | Login only, no private data                             | No workflow data should leak into unauthenticated routes.              |
| Signed in, first run             | Default or empty areas, clear path to Capture and Areas | Setup must be skippable enough to start capturing.                     |
| Signed in, Supabase available    | Account rows hydrate into cockpit                       | Area ids map to cockpit ids; local recovery rows remain until synced.  |
| Signed in, Supabase degraded     | Cockpit stays usable with local/session state           | Show account truth near affected actions, not as a global panic state. |
| Local-only or missing env        | Mock/local workflow works                               | Do not imply account persistence.                                      |
| Google disconnected              | Planning remains local                                  | Calendar write controls stay secondary and explain connection state.   |
| Google connected                 | Free/busy and write approval are available              | No write without explicit confirmation and audit record.               |
| AI unavailable or invalid output | Raw capture remains; user can retry or manually triage  | Never lose raw text or persist invalid AI output as committed work.    |
| Storage blocked                  | Current in-memory workflow still works                  | Degrade visibly if persistence cannot be trusted.                      |
| Mobile viewport                  | Same workflow order, less chrome                        | No hidden primary action; no horizontal overflow.                      |

## 4. Core Journey Cases

| Case                     | Path                                                          | Current target                                                                                                      |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Fast task capture        | Capture -> Triage -> Do today -> Plan                         | Supported in cockpit; account persistence is best-effort when signed in.                                            |
| Future idea              | Capture -> Triage -> Someday -> All areas/backlog             | Supported; persists as `backlog` when signed in.                                                                    |
| Not useful               | Capture -> Triage -> Drop                                     | Supported locally; persistence parity should be reviewed before treating as audit-grade history.                    |
| Already planned work     | Today or Plan -> Execute -> Review                            | Supported locally and partially persisted through sessions.                                                         |
| Local-only planning      | Plan -> hour rail -> local block -> Execute                   | Supported; does not require Google.                                                                                 |
| Calendar-backed planning | Plan -> approval disclosure -> final confirm -> Google write  | Approval-gated path exists outside the simplified hour rail; keep secondary.                                        |
| Missed block recovery    | Execute/Plan -> mark missed -> reschedule/drop/defer          | Product-required; current cockpit needs a dedicated follow-up for full persistence and Google update/cancel parity. |
| Ambiguous capture        | Capture -> sense-making -> selected first move -> Triage/Plan | Required by docs; should stay draft-first and avoid fake roadmaps.                                                  |
| Daily closeout           | Review -> carry forward/drop/defer/save -> Today              | Partially supported; carry-forward persistence parity remains follow-up.                                            |
| Weekly calibration       | Review -> area patterns -> approve/reject suggestions         | Required, but policy changes must stay approval-gated and area-scoped.                                              |
| System repair            | Health -> incident detail -> repair action -> workflow        | Health is the diagnostic home; route-level copy should stay calm unless blocked.                                    |
| Area administration      | Settings/Areas -> create/recolor/archive -> cockpit           | Supported outside cockpit; header add/recolor supports common cockpit actions.                                      |
| Export                   | Settings/Areas -> export -> download or recoverable error     | Supported admin behavior; never include secrets or OAuth token material.                                            |

## 5. Screen-by-Screen Branch Map

### Today

| Branch                           | Next action                       | Edge behavior                                                 |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| No accepted work                 | Send to Capture                   | Keep Today read-only; do not invent tasks.                    |
| Captures waiting                 | Send to Triage                    | Show count once; avoid duplicating state in multiple places.  |
| Active tasks but no plan         | Send to Plan                      | Keep one dominant next action.                                |
| Planned block exists             | Send to Execute                   | Show time and area.                                           |
| Health issue blocks account sync | Send to Health or keep local path | Do not make local work look blocked if only sync is degraded. |

### Capture

| Branch                     | Next action                                                 | Edge behavior                                                              |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Empty input                | Disable or reject save                                      | Plain message; no fake capture row.                                        |
| Valid text, area selected  | Save raw capture, then draft                                | Persist area when mapped; otherwise keep local.                            |
| Valid text, no area        | Save raw capture with unresolved area                       | Triage owns area resolution.                                               |
| AI parse succeeds          | Add drafts, route to Triage                                 | Drafts remain editable.                                                    |
| AI parse fails             | Keep raw capture, show retry/manual path                    | No raw text loss.                                                          |
| AI returns invalid schema  | Reject model output                                         | Show recoverable error; do not weaken schema.                              |
| User double-clicks save    | Avoid duplicate committed work                              | UI should disable or dedupe while saving.                                  |
| Huge/messy/malicious text  | Treat as data                                               | Captured text must not override system instructions.                       |
| Audio capture              | Record/upload -> transcribe -> editable transcript -> parse | Not live streaming; failed transcription must not erase attempt.           |
| Offline/account sync fails | Local capture remains visible                               | Retry later or hydrate account state without dropping local unsynced rows. |

### Triage

| Branch                 | Next action                                  | Edge behavior                                                  |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| No queue               | Send to Capture or Plan                      | Do not turn empty Triage into dashboard clutter.               |
| One current draft      | Do today / Someday / Drop                    | One decision at a time.                                        |
| Many drafts            | Current item plus next-up queue              | Bulk reject is useful, but should not dominate the handoff UI. |
| Low area confidence    | Reassign area or leave unresolved            | Correction should feed area-scoped learning.                   |
| Do today               | Create active task and optional proposal     | Persist as `active` when signed in.                            |
| Someday                | Create backlog task                          | Persist as `backlog` when signed in.                           |
| Drop/reject            | Remove from active queue                     | Decide later whether rejected draft needs durable audit.       |
| Edit                   | Update draft before commit                   | Editing remains pre-commit unless explicitly accepted.         |
| Split/merge            | Produce multiple or consolidated drafts      | Required by docs; needs targeted UI/persistence follow-up.     |
| Stale draft after sync | Prefer persisted truth, keep unsynced locals | Do not duplicate local and persisted versions.                 |

### Plan

| Branch                     | Next action                              | Edge behavior                                               |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| No active tasks            | Send to Capture/Triage or show backlog   | Do not fake a schedule.                                     |
| Active task selected       | Hour rail creates local block            | Local plan can exist without Google.                        |
| Backlog task promoted      | Move to active planning                  | Keep area and first tiny step visible.                      |
| Proposal edited            | Update local proposal                    | Persisted edit parity is a follow-up.                       |
| Proposal rejected          | Remove proposal or supersede             | Persisted reject parity is a follow-up.                     |
| Conflict flag              | Show conflict plainly                    | Conflict is advisory unless external write is requested.    |
| Google disconnected        | Keep approval section disabled/secondary | Local plan remains valid.                                   |
| Free/busy fails            | Show calendar check failure              | Do not block local planning.                                |
| User requests Google write | Show final confirmation                  | Must include title, area, time, calendar, conflict warning. |
| Duplicate write attempt    | Prevent second event                     | Use proposal status/event id checks.                        |
| All-day conflict           | Flag as unproven follow-up               | Do not claim coverage until implemented.                    |
| Unplan                     | Remove local scheduled block             | Persistence parity remains follow-up.                       |

### Execute

| Branch                     | Next action                              | Edge behavior                                           |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| No planned block           | Send to Plan                             | Do not show meaningless timer.                          |
| Planned block selected     | Start session                            | One task only.                                          |
| Running session            | Pause, complete, distracted, stuck, stop | Timer is helpful UI, not authoritative persisted truth. |
| User captures side thought | Save without leaving session             | Side capture must not interrupt execution flow.         |
| Completed                  | Save outcome and go to Review            | Persist outcome when signed in.                         |
| Partial/stopped            | Save actual outcome                      | Avoid shame language.                                   |
| Distracted                 | Record distraction and continue/review   | Use recovery language.                                  |
| Stuck                      | Offer smaller next step                  | Do not invent broad plan.                               |
| Missed                     | Send to missed recovery                  | External calendar update still requires approval.       |
| Reload during timer        | Show persisted or local best truth       | Do not pretend a live timer survived if it did not.     |

### Review

| Branch              | Next action                            | Edge behavior                                   |
| ------------------- | -------------------------------------- | ----------------------------------------------- |
| Nothing to review   | Offer Today/Capture/Plan               | Keep it short.                                  |
| Completed work      | Save review                            | Do not over-celebrate or add analytics clutter. |
| Open work           | Carry forward, defer, drop, reschedule | External writes still gated.                    |
| Missed work         | Recovery choice                        | No shame wording.                               |
| Blocked work        | Smaller next step or defer             | Keep uncertainty visible.                       |
| Captures unresolved | Send to Triage                         | Do not bury unresolved raw captures.            |
| Weekly patterns     | Show area-level trends                 | Policy suggestions require approval.            |
| Save review fails   | Keep review content local/retryable    | Do not mark saved if persistence failed.        |

### Health

| Branch             | Next action                          | Edge behavior                                    |
| ------------------ | ------------------------------------ | ------------------------------------------------ |
| Healthy            | Show grouped status and quiet detail | Avoid turning Health into celebration dashboard. |
| Auth degraded      | Explain account impact               | Local workflow may still work.                   |
| Database degraded  | Explain persistence impact           | Do not imply data synced.                        |
| AI degraded        | Explain parse impact                 | Manual capture/triage remains possible.          |
| Calendar degraded  | Explain planning/write impact        | Local planning remains possible.                 |
| Multiple incidents | Group by subsystem                   | Avoid one noisy wall of technical detail.        |
| Unknown incident   | Show honest unknown and next check   | No AI-invented health score.                     |

### All Areas

| Branch              | Next action                          | Edge behavior                                     |
| ------------------- | ------------------------------------ | ------------------------------------------------- |
| Areas exist         | Show global overview                 | Not scoped to active area; label that clearly.    |
| No areas            | Send to Settings/Areas or header add | Do not block raw capture if area is optional.     |
| Area has null color | Use persisted/default palette color  | Cockpit still derives accent from one base color. |
| Inactive area       | Hide from normal active cockpit      | Historical data remains preserved.                |
| Heavy backlog       | Show size-by-load                    | Avoid analytics-first dashboard behavior.         |

### Settings / Areas Admin

| Branch            | Next action                       | Edge behavior                                             |
| ----------------- | --------------------------------- | --------------------------------------------------------- |
| Create area       | Persist area and return usable id | New area should be immediately recolorable/selectable.    |
| Recolor area      | Persist palette color             | Cockpit derives accent; do not hardcode component hex.    |
| Archive area      | Mark inactive, preserve history   | Must not delete historical tasks/captures.                |
| Export data       | Create complete export            | No partial export on failure; no secrets or OAuth tokens. |
| Connect Google    | OAuth flow                        | Token material stays server-side only.                    |
| Disconnect Google | Remove app connection             | Existing local workflow remains usable.                   |

## 6. Cross-Cutting Edge Cases

| Edge case                              | Required response                                                | Test/proof need                                   |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| User A attempts User B data            | Deny through RLS                                                 | RLS two-user tests.                               |
| Missing env vars                       | Degrade to local/demo-safe mode                                  | Config tests and visible copy.                    |
| Supabase returns stale rows            | Merge persisted rows without duplicating local unsynced rows     | Provider tests.                                   |
| Persisted area slug maps to cockpit id | Use stable data ids, derived cockpit ids                         | Area mapping tests.                               |
| Custom area has no canonical slug      | Use persisted UUID as cockpit id                                 | Provider tests.                                   |
| Browser storage blocked                | Keep current in-memory state                                     | Manual or unit coverage.                          |
| Network drops during action            | Local action remains visible; sync retry is explicit future work | Persistence tests plus follow-up issue if needed. |
| AI suggests unsafe external action     | Treat as suggestion only                                         | Source-of-truth tests around server boundaries.   |
| AI output includes prompt injection    | Treat capture as data                                            | Parser contract tests.                            |
| User changes active area mid-flow      | Current item keeps its own area truth                            | UI regression test.                               |
| Mobile narrow width                    | No overflow, no lost primary action                              | Playwright mobile route sweep.                    |
| Theme toggle                           | `data-theme="light"` only on cockpit root                        | Theme E2E and accent tests.                       |
| Area color contrast                    | Derive accent with `accent.js` contrast rule                     | Accent unit tests.                                |
| Calendar write retry                   | Idempotent or duplicate-safe                                     | Route tests and manual calendar smoke.            |
| Calendar provider error                | Show recoverable failure; do not mark scheduled                  | Route tests.                                      |
| Health incident after failed provider  | Health separates auth/db/AI/calendar failures                    | Health tests.                                     |

## 7. Persistence Parity Checklist

| Workflow behavior                                        | Current status           | Needed before calling it complete                                   |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| Hydrate areas into cockpit                               | Implemented              | Keep mapping tests.                                                 |
| Hydrate captures/tasks/proposals/blocks/sessions/reviews | Implemented              | Add broader fixture coverage as models grow.                        |
| Save raw capture                                         | Implemented best-effort  | Add retry queue if account-sync loss becomes common.                |
| Do today                                                 | Implemented best-effort  | Confirm proposal creation behavior remains desired.                 |
| Someday                                                  | Implemented as `backlog` | Keep status schema narrow to `active`/`backlog` on create.          |
| Drop/reject draft                                        | Local/session            | Decide if rejected drafts need durable audit.                       |
| Edit draft                                               | Local/session            | Persist only after commit unless product changes.                   |
| Split/merge draft                                        | Not complete             | Needs UI, state, persistence, and tests.                            |
| Hour rail local plan                                     | Implemented best-effort  | Keep Google writes secondary.                                       |
| Manual proposal create/edit/reject                       | Local/session            | Add scoped persistence slice.                                       |
| Unplan block                                             | Local/session            | Add scoped persistence slice.                                       |
| Start session                                            | Implemented best-effort  | Prove reload behavior.                                              |
| Mark session outcome                                     | Implemented best-effort  | Keep transactional server boundary.                                 |
| Missed block recovery                                    | Partial/local            | Needs dedicated recovery slice and calendar update/cancel decision. |
| Daily review carry-forward                               | Partial/local            | Add persistence parity.                                             |
| Weekly policy suggestion                                 | Logged/unused            | Meta-learning follow-up remains scheduled.                          |

## 8. Test Coverage Map

| Flow                 | Minimum proof                                                      |
| -------------------- | ------------------------------------------------------------------ |
| Route graph          | Route smoke plus handoff cockpit E2E route sweep.                  |
| Capture raw-save     | Unit/component test and E2E capture-to-triage path.                |
| Triage decisions     | Unit/component tests for Do today, Someday, Drop.                  |
| Area mapping         | Provider tests for canonical and custom areas.                     |
| Planning local-first | E2E hour rail proof plus no Google-write assertion.                |
| Google write         | Route tests with mocked provider and manual real-provider smoke.   |
| Execute outcomes     | Unit/component tests plus persistence tests.                       |
| Review carry-forward | Component tests once persistence parity is added.                  |
| Health incidents     | Deterministic health tests by subsystem.                           |
| RLS                  | Local Supabase two-user tests when tables or policies are touched. |
| Mobile               | Playwright 390px route sweep.                                      |
| Theme/accent         | Unit tests plus browser toggle proof.                              |

## 9. Strategic Implementation Order

1. Keep the current cockpit visual system stable.
2. Add targeted tests for any branch before changing behavior.
3. Finish persistence parity for manual proposal actions and unplan before expanding planning UI.
4. Build missed-block recovery as its own slice because it touches scheduling, review, and future Google update/cancel scope.
5. Add daily review carry-forward persistence after missed-block behavior is clear.
6. Revisit split/merge and sense-making only after the simple triage lifecycle is reliable.
7. Treat Google Calendar update/cancel, all-day conflicts, and real production smoke as explicit reviewed follow-up work.
