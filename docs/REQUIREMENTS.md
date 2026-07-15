# REQUIREMENTS.md

# Requirements — Area-Scoped Personal Workflow Cockpit

## 1. Requirement Levels

Use these labels:

- **MUST**: required contract
- **SHOULD**: strong approved candidate
- **COULD**: optional enhancement requiring an owner-ratified slice
- **WON'T BASELINE**: excluded from the shipped V1 baseline; not automatically approved later

V1 is the shipped baseline, not the product ceiling. Under ADR 0005, stage labels express dependency and risk order. Data-independent foundations may proceed through an owner-ratified issue when they preserve all invariants. Usage evidence remains mandatory for personalization conclusions, initiative or autonomy graduation, proactive interruption, external channels or writes, and data-derived policy changes. Permanent non-goals remain binding at every stage.

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

**Priority:** SHOULD; submit-based audio only unless a reviewed requirement explicitly expands the contract

Audio should be implemented as record/upload → transcribe on submit → parse transcript.

Acceptance criteria:

- Live realtime voice remains unapproved; adding it requires explicit requirements review and must preserve the privacy, cost, and consent boundaries.
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
- **One planning model (owner decision 2026-07-14, "placement wins"):**
  direct placement of a task onto an hour is the authoritative scheduling
  action. Placing a task automatically supersedes that task's pending
  proposals (status `superseded`, never deleted); accepting a proposal IS
  placement (one code path). A task never simultaneously has a scheduled
  block and an active proposal; the UI presents exactly one way to
  schedule — proposals are suggestions feeding it, not a parallel model.

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

### FR-017 — People & Commitments

**Priority:** MUST, with SHOULD-level aging surfacing

**Stage:** Stage 1 (epic #251), slice S1

Acceptance criteria:

- Person entity is scoped to the user.
- Tasks can reference a person as waiting-on or committed-to.
- Person creation/linking happens only via user approval at triage (NS-INV-4).
- Unmatched person mentions degrade to plain tasks with raw capture preserved.
- Aging surfacing follows FR-013 review and FR-015 health, rule-based only (SHOULD).

Non-goals:

- CRM features.
- Contact sync.
- Email/message ingestion.
- Org charts.

---

### FR-018 — Identity Context

**Priority:** MUST

**Stage:** Stage 1 (epic #251), slice S2

Acceptance criteria:

- Per-area charter (purpose, ideal state, current season, constraints) exists, editable from area admin (SHOULD).
- One global operator profile (named strengths/weaknesses with compensation rules) exists, editable from settings (SHOULD).
- All prompt personalization flows through one context-assembly module (NS-INV-1).
- Empty charter/profile leaves AI behavior identical to pre-Stage-1 behavior (fixture-proven).

Non-goals:

- AI-authored charters without user edit/approval.
- Per-task identity overrides.

---

### FR-019 — Daily Focus & Brief

**Priority:** MUST

**Stage:** Stage 1 (epic #251)

Acceptance criteria:

- Daily focus budget is deterministic, derived from Google free/busy read data.
- Default thresholds: free hours >= 5 => 3 focus items; 2-5 => 2; < 2 => 1; free/busy unavailable => 2 (degraded default).
- Brief panel on Home is a read-only synthesis (blocks, focus, aging items, one stale project, recovery nudge) issuing zero mutations.

Non-goals:

- Notifications.
- Email digests.
- Autonomous re-planning.

---

### FR-020 — Wins & Rollups

**Priority:** MUST

**Stage:** Stage 1 (epic #251), slice S7 (wins), slice S8 (rollups)

Acceptance criteria:

- Weekly review offers win candidates from completions.
- Only user-confirmed wins persist.
- Weekly rollup per area is AI-drafted against a strict schema and persists only on user approval.
- Monthly rollup composes approved weeks.
- Rollups become a context source via the NS-INV-1 module.

Non-goals:

- Sentiment analysis.
- Vector embeddings.
- Background summarization jobs.

---

### FR-021 — Learning Consumer v1

**Priority:** MUST

**Stage:** Stage 1 (epic #251)

Acceptance criteria:

- Time-block proposals display area-scoped duration recalibration with its evidence, computed as median(actual/estimated) over the last >= 5 completed blocks in that area (no display below 5 samples).
- Recalibrated default applies only after user acceptance.
- Deterministic override-pattern scan (same policy_id overridden >= 4 of last 5 occurrences) produces a policy-change proposal in weekly review.
- Accept/decline is recorded per #235 vocabulary.

Non-goals:

- Silent policy mutation.
- AI-invented policies.
- Cross-area generalization in v1.

---

### FR-022 — WIP Enforcement

**Priority:** MUST

**Stage:** Constraint layer (owner-ratified 2026-07-05; lands interleaved with Stage 1 slices)

Rationale: the operator's root bottleneck is over-activation, not under-capability. The predecessor system structurally could not refuse a fourth active item. Refusal is the feature.

Acceptance criteria:

- At most 3 tasks may hold the committed-for-execution state (scheduled into today or in-execution) at any time.
- Attempting to activate a 4th is refused — not warned, refused. The refusal surface shows which 3 items hold the slots and offers a one-click swap (deactivate one to admit the new one).
- Enforcement is deterministic code, not prompt behavior, and applies to every activation path (triage accept-to-today, plan scheduling, execute start).
- Each refusal and each swap is recorded (per #235 vocabulary) so the learning loop can see over-activation pressure.

Non-goals:

- Configurable or per-area WIP limits (the limit is 3; changing it is a REQUIREMENTS change, not a setting).
- Soft-warning mode.
- Any override toggle in v1.

---

### FR-023 — Launch-Sequence Gate

**Priority:** MUST

**Stage:** Constraint layer

Rationale: starting-friction compensation. A task without a physically executable opening move is a stall in waiting.

Acceptance criteria:

- A task cannot be scheduled (time-block proposal accepted, or added to today's committed set) unless `first_tiny_step` is populated with a sub-60-second physical first move.
- The gate blocks with an inline prompt to write the move ("What is the under-a-minute physical move that starts this?"); AI may pre-draft it at parse time (existing `first_tiny_step` flow), but the gate validates presence and the scheduling UI displays the move at the moment of commitment.
- The first node of any task breakdown/progression rail and `first_tiny_step` are the same fact — one field rendered in both places, never two competing values.

Non-goals:

- Measuring or enforcing the actual duration.
- Gating capture or triage (the gate applies at scheduling, where commitment happens).

---

### FR-024 — Decision Object

**Priority:** MUST

**Stage:** Constraint layer

Rationale: decisions loop as research when they carry no deadline and no reversibility framing. The deadline is the anti-research-loop mechanism.

Acceptance criteria:

- A decision is a task with `task_type = "decision"` carrying exactly: what is being decided (title), a reversibility flag (reversible / one-way door), and a decision deadline (reuses `due_at`; required for decisions).
- The deadline surfaces in daily focus and brief exactly like a due task; a reversible decision at deadline prompts "decide now with what you know — it's reversible."
- Closing a decision records the choice as free text.

Non-goals (binding — these metastasize):

- Options tables.
- Criteria weighting or scoring matrices.
- Research-link collections attached to decisions.

---

### FR-025 — DoD-Cap State Machine

**Priority:** MUST

**Stage:** Constraint layer

Rationale: deletes "polish forever" as a reachable state.

Acceptance criteria:

- An execution block reaching its time cap with the task's `definition_of_done` unmet forces a binary choice: CUT SCOPE (edit the DoD down to what is true now and close done) or DEFER (explicit re-block or return to backlog, with a one-line carry note).
- Silently continuing past the cap is not a reachable state in the execute surface.
- The outcome (cut vs defer, plus the DoD delta when cut) is recorded per #235 vocabulary — prime learning-loop signal.

Non-goals:

- Auto-extension or snooze.
- Penalty framing (caps are how work ends, not a failure).

---

### FR-026 — Capture Containment (AI-Wait)

**Priority:** MUST

**Stage:** Constraint layer — binding on every capture/parse surface, including future ones.

Rationale: the standard async pattern (submit → spinner → notify-when-done → user wanders off) is a context-switch cascade generator for this operator. This requirement is deliberately counter to the default pattern any implementer would reach for. Do not normalize it back to the standard pattern.

Acceptance criteria:

- During a parse wait, the capture UI holds the user in context: the raw captured text remains fully visible, and a "return hook" field (one line: what you were doing before this thought interrupted, i.e. what you return to) is visible and editable while waiting.
- A new capture cannot begin until the current one resolves (parse returns and the draft is dispatched, or the capture is saved raw). No capture queue.
- No fire-and-forget: notify-me-later parsing is prohibited for capture. If parse exceeds its latency budget, the surface degrades synchronously (offer mock parse / save raw now) rather than going async.
- On resolve, the return hook is displayed as the final element of the capture interaction ("back to: <hook>").

Non-goals:

- Background parse queues.
- A parse notification center.
- Making the return hook mandatory-to-submit in v1 (visible and encouraged; hard-mandatory only if decision data shows it is skipped and regretted).

---

### FR-027 — Capture Ubiquity (installable + offline raw-capture)

**Priority:** MUST

**Stage:** Daily-driver floor (owner-ratified 2026-07-04; lands before further behavioral features). Same capture/parse surface as FR-026 — see reconciliation note.

Rationale: capture today is a desktop web tab; thoughts arrive on the phone and mid-task. A capture that is not reachable at the moment of the thought is a capture that never happens — the highest-frequency adoption saboteur. This is not a new perimeter integration: it is the same spine capture surface made reachable and resilient. It is the raw-save-first complement to FR-026 containment, not a competitor to it.

Acceptance criteria:

- The web app is installable as a PWA (web app manifest + service worker) so capture opens from a phone home-screen icon in one tap, and registers as a share target so text shared from another phone app lands directly in a raw capture.
- Offline raw capture is save-first with no parse wait. When offline (or when the user chooses "save raw"), the capture is written to a device-local queue immediately and the interaction ends — there is NO spinner, NO parse wait, NO "notify me later" (consistent with FR-026's prohibition of fire-and-forget async: the offline path resolves synchronously as saved-raw, it does not go pending-async).
- Queued raw captures sync to the spine (`capture_items`) automatically when connectivity returns; parse happens at triage, not at sync time. Sync is idempotent (a client-generated `client_capture_id` dedupes replays).
- A queued-but-unsynced capture is never silently lost and its unsynced state is visible (count/badge); loss of the device before sync is the only unrecoverable case and the queue is durable across app restarts until synced.
- The PWA is a capture + read reach extension only. It introduces no new write path to the spine beyond the existing authenticated `capture_items` insert; it holds no OAuth tokens and no service keys (NS-INV-9 perimeter containment holds even though the PWA is first-party).
- When the user is in the capture surface awaiting a parse (online, chose to parse now), FR-026 containment applies unchanged (return hook visible, no second capture, synchronous degrade). FR-027 governs only the raw-save / offline / share-target entry paths where there is no parse wait at all.

Non-goals:

- Any new ingestion channel, messaging bridge, or third-party integration (that is Stage-3 perimeter, gated separately — a first-party PWA is not a perimeter channel).
- Background sync that parses without the user (parse stays a triage step; the queue only transports raw text).
- Offline editing/triage/planning (offline scope is raw capture only in v1).
- Push notifications.
- A capture queue while online and awaiting parse (FR-026 forbids that; the offline queue is a distinct raw-transport buffer, not an online parse queue).

---

### FR-028 — Re-Entry Amnesty (return without a guilt wall)

**Priority:** MUST

**Stage:** Daily-driver floor. Extends UX_FLOWS Flow 8 (missed-block recovery) philosophy — does not fork it.

Rationale: after days away, the app currently greets the returning user with a wall of overdue/red — the single most common cause of abandonment for this operator profile. A return after an absence must lower activation energy, not raise it. This is Flow 8's "a missed block is not a failure" doctrine, batched across an absence.

Acceptance criteria:

- On the first open after an absence of >= N days (default N configurable in settings, seed N = 3), the app runs a deterministic, rule-based return ritual instead of the normal today view.
- Scheduled blocks whose time has fully passed during the absence are auto-deferred to an unscheduled/backlog state by a deterministic rule (no AI), and every such deferral is enumerated in the "while you were out" summary — it is a reversible internal status transition surfaced in a batch, not a silent write. NS-INV-4 governs AI-generated artifacts and external writes; a rule-based, deterministic, reversible, non-AI, enumerated local status transition is a bounded-rule exception to it, not a violation — the single recovery proposal below remains a full NS-INV-4 proposal. No external calendar mutation occurs (any calendar change remains a Flow 8 proposal).
- The backlog is collapsed into a single "while you were out" summary (counts + the deferral list + the one stalest thing) rather than an item-by-item overdue list.
- The ritual surfaces exactly one recovery proposal — a single suggested first move to re-enter — as an L1 proposal the user accepts, edits, or dismisses (never auto-started). On accept, the recovery move follows the normal activation path and is subject to FR-022 WIP and FR-023 launch-sequence gating like any other commitment — no special-cased bypass.
- Zero red on screen during the ritual: no overdue badges, no failure language, no penalty framing (UX_FLOWS principle: no guilt/penalty language).
- The absence, the auto-deferrals, and the recovery-proposal resolution are recorded per #235 vocabulary (`re_entry.v1`) so the learning loop sees absence/recovery patterns.

Non-goals:

- AI-generated re-entry narrative or summarization (the summary is rule-based aggregation; the single recovery move may be an existing-mechanism suggestion, not a new AI surface).
- Auto-starting the recovery move or auto-rescheduling anything onto the calendar.
- A configurable multi-step "catch-up wizard."
- Silently deleting or archiving lapsed items (they are deferred to backlog, always recoverable, always listed).

---

### FR-029 — Persistence Truth + Session Longevity

**Priority:** MUST

**Stage:** Daily-driver floor.

Rationale: (a) the app can run in a browser-only demo fallback that looks identical to the persisted app — a user can capture for days into memory that evaporates on reload, the most corrosive possible trust failure. (b) The Supabase session does not survive weeks, so a returning user is bounced to login and loses the "what now" in one action. Both are silent, both kill daily trust.

Acceptance criteria:

- Loud non-persistence. Whenever the data provider is the browser-only demo fallback (`provider === "mock"` — the existing signal in `workflow.ts`/`health.ts`), the capture surface (and other write surfaces) render an unmissable, persistent non-persistence indicator ("Demo mode — nothing here is saved") that cannot be mistaken for the normal persisted UI. The surface refuses to look normal in this state (UX_FLOWS truthful-surface / UX-INV-6).
- Demo mode is never entered silently: per VERCEL_PRODUCTION_CHECKLIST §1, a production deploy with missing `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` truthfully degrades to Demo mode on the affected surfaces (the checklist deliberately does NOT fail the build closed) — so FR-029's job is to make that degrade loud and unmissable on-surface, not to block the deploy. The loud banner IS the production safeguard; there is no fail-closed build gate to add.
- Session longevity. The Supabase browser session is configured to persist and auto-refresh through a secure client library (SECURITY_PRIVACY §3) so a returning user within a multi-week window is not forced to re-authenticate; the session survives normal browser restarts.
- Fast "what now". On open with a live session, the primary "what now" surface is interactive within ~3s on a warm load.
- Session/token handling continues to obey SECURITY_PRIVACY: no tokens in logs, no tokens to AI, no service-role key client-side; session storage uses the secure client-library mechanism (cookies via `@supabase/ssr` or the library's `persistSession` storage), not hand-rolled token stashing.

Non-goals:

- "Remember me forever" / non-expiring sessions (respect Supabase refresh-token lifetime; longevity means "survives weeks," not "never expires").
- Offline auth or local credential storage beyond the client library's own session store.
- A second persistence backend or local-first sync engine (that is not this floor).
- Making demo mode unavailable — it stays as the deterministic offline/dev fallback; it is only made loud.

---

### FR-030 — Provider Canary + Mock-First Auto-Degrade

**Priority:** MUST

**Stage:** Daily-driver floor.

Rationale: a real incident (OpenAI 429 for hours) was discovered only by manual probing. A provider that is silently down turns every capture into a failed parse with no signal. A scheduled canary + automatic degrade closes both the detection gap and the user-facing blast radius.

Acceptance criteria:

- A scheduled GitHub Actions cron probes the production parse path (and other provider paths as they are added) on a fixed interval, reusing the house watchdog pattern (`migration-drift.yml` shape: skip-with-warning when the required secret is absent; `::error:: + exit 1` on failure so the run goes red).
- On a detected failure state transition (healthy→failing), the canary raises a GitHub issue (the house alert channel, per `pipeline-advance.yml`'s issue-write pattern) — it does not spam an issue every run.
- The probe is near-free (NFR-001): it first reads recent recorded real-parse outcomes from `ai_call_traces` (a cheap read; `latency_ms`/`status` already recorded fire-and-forget per real parse); it issues a synthetic real parse POST only when there is no recent real signal or to confirm a suspected transition. It never runs a paid parse on every tick.
- Mock-first auto-degrade. When the provider is known-down (canary-detected or runtime 429 observed), the parse surface degrades to mock/deterministic parsing automatically and visibly, rather than surfacing repeated failures — extending the existing `parseCaptureWithFallback` degrade from "key absent" to "provider runtime-down."
- The degrade and the recovery are visible on the Health surface (connector/AI-failure separation, NFR-004) and recorded so the learning loop / audit sees provider incidents.

Non-goals:

- A second AI provider / failover vendor (doctrine cap: no new vendors; degrade target is the existing mock path, not a competitor LLM).
- A paid probe on every cron tick (cost cap — synthetic POST only on transition/no-signal).
- A realtime status page or paging/on-call integration (the GitHub issue is the alert channel).
- Auto-re-enabling the provider without evidence it recovered (recovery is canary-confirmed, then auto or one-tap).

---

### FR-031 — Task-Map v1 (DAG Progression Map)

**Priority:** MUST

**Stage:** Approved contract — owner-ratified through issue #484 and PR #487. Implementation follows the S2 → S3 (#255) → FR-031 dependency chain in `docs/implementation-planning/plan-task-map-contract.md` and requires an issue-scoped build contract.

Rationale: real work branches and converges — forcing every breakdown into a single ordered list either flattens genuine parallel/optional structure or invites the operator to fake a linear order to fit the tool. The owner's 2026-07-09 extension of the original task-map draft (recorded in the STATUS line of `plan-task-map-contract.md`) requires a true DAG, and requires the headline "critical path" to be a deterministic, code-computed traversal of the approved graph rather than an AI-asserted flag — the overplanning governor (one-pass approve, collapse-to-critical-path default, draft-until-approved diffs) is worthless if the thing being approved and collapsed to is itself an ungrounded AI guess. Optional nodes give the operator a legible, pre-approved fallback for FR-025's cut-scope moment instead of an ad hoc DoD edit under time pressure. Red nodes give the map a cheap, capped way to record known dead ends and gated moves without turning it into a full risk register.

Acceptance criteria:

- The task breakdown renders as a directed acyclic graph — nodes connected by dependency edges that may branch (one node feeding multiple next nodes) and merge (multiple nodes feeding one next node) — not a linear ordered list.
- The critical path is computed deterministically in code from the approved node/edge graph. Enforcement is deterministic code, not prompt behavior (FR-022 precedent): the AI drafts the candidate graph only; no AI call determines, edits, or re-scores which nodes are highlighted as critical, at draft time or on any later re-approval.
- Optional nodes are off the critical path, never block progression to subsequent required nodes, and feed the task's Definition of Done / success criteria as declared. They are the ready-made cut-scope candidates surfaced by the existing FR-025 DoD-cap flow: when the DoD-cap state machine fires CUT SCOPE, the surfaced candidates for scope reduction are the map's not-yet-completed optional nodes.
- Red nodes express do-not / only-if-condition guidance and are not actionable steps. Each red node is REQUIRED to carry a cited `red_reason` (why this path is disallowed or conditional) and MAY carry a `red_condition` (the condition under which it becomes allowed). A map carries **at most 2 red nodes**.
- Overplanning governor lifecycle: AI drafts the full graph → the owner approves the whole draft in **one pass** (a single L1 approval of one suggestion instance, ADR 0002 D1 — not an L2 pre-filled auto-execute default) → the default view **collapses to the critical path**, with non-critical/optional/red nodes behind an expand affordance. After approval, any map change is an **AI-proposed diff**, offered only at node-completion or session/day Close, and stays **draft-until-approved** (a fresh L1 approval per diff, NS-INV-4); the approved map is never mutated silently.
- Hard v1 caps, regardless of trust rung: **at most 7 required nodes and at most 4 optional nodes** per map, **at most one level of branching** (no nested sub-branches), and at most 2 red nodes (per above). Map generation is **on-demand only** — triage-accept or explicit user-requested regeneration — never a background job (NFR-001 / NFR-005).
- All AI-drafted graph/node/edge output validates against a strict versioned schema (`packages/schemas`) before persistence; invalid output is rejected and the surface degrades to the existing plain-breakdown rail (NFR-004). No AI-drafted map content is ever written externally — NS-INV-1, NS-INV-4, and NS-INV-9 apply unchanged and are not restated here.
- As an AI judgment surface, the map is born instrumented per NS-INV-3 (stable policy id, versioned zod schema, `suggestion_records` / `override_records`) with no bespoke plumbing of its own.

Non-goals:

- Cross-task edges or a DAG spanning multiple tasks (that is the v2 `task_edges` normalized graph — see `plan-task-map-contract.md` §4.1).
- More than one level of branching depth, or more than 7 required / 4 optional / 2 red nodes.
- Autonomous or background map regeneration; any revision outside the node-completion / Close proposal points.
- Any AI call that determines or overrides the critical-path highlight directly — that computation is code-only.
- Gamification scoring, streaks, or reward mechanics.

---

### FR-032 (approved contract) — Initiative Ladder

**Priority:** SHOULD

**Stage:** Evidence-dependent trust graduation; doctrine is approved now, while I2+ code requires per-class evidence and explicit graduation.

Rationale: the trust ladder (ADR 0002 D1) governs what the system may _do_; nothing yet governs when it may _speak_. Attention is the scarcest resource in the dyad, and every proactive surface (brief, aging nudges, recovery proposals, future Hermes presence, future notifications) draws on one unpriced account. Interruption rights must be earned the same way autonomy is.

Acceptance criteria (contract-grade — rung implementation proceeds only when its class-specific evidence, dependencies, reviewed contract, and explicit graduation are satisfied):

- Interruption rights form a ladder parallel to the trust ladder: **I0** answers only when asked; **I1** surfaces only at user-initiated moments (Start / Flow / Close, the brief); **I2** may interject mid-day within an explicit budget (default max 1/day) for evidence-strong classes only; **I3** may initiate outside the app (notification, channel).
- Every proactive surface declares an initiative class and starts capped at I1.
- I2 eligibility is per class: shadow-rehearse first, record at least 20 eligible I1/shadow opportunities, demonstrate an acceptance or welcome rate of at least 80%, keep dismissals below 20%, and obtain explicit graduation approval. I3 additionally requires a separately reviewed external-channel/write contract plus at least 20 accepted I2 interjections for that class. Graduated classes are **demoted automatically** on dismissal spikes (e.g. 3 dismissals of a class in 7 days → drop one rung, cooldown before re-eligibility).
- The FR-019 "notifications" non-goal is hereby reframed as **I1-capped until graduation**, not a permanent never. Any future notification/Hermes surface must cite this FR and its rung.

Non-goals (binding):

- Any I2+ surface before its class has the required evidence, reviewed contract, and explicit trust graduation.
- Exempting any proactive surface (delight, health, Hermes) from the ladder.
- Engagement-driven interruption (variable-reward timing, streak pressure) — see permanent non-goals.

---

### FR-033 (approved contract) — Purpose Gauge

**Priority:** SHOULD

**Stage:** Stage 2.

Rationale: the system's purpose is anxiety reduction, yet every metric it holds (throughput, override rate, re-entry latency) is a _proxy_ for calm. Optimizing proxies of calm can diverge from calm itself (Goodhart). The system's one true variable should be observable, honestly, so a stage that improves throughput but not calm can be seen to be failing its purpose.

Acceptance criteria:

- At Close (I1, never interruptive), occasionally — sampled, at most ~4×/month, never daily — one optional tap: "how did today sit with you?" on a 3-point scale (lighter / even / heavier).
- Skippable forever with no consequence; no streak; a skipped or absent check is never counted, shown, or treated as signal (sanctuary-compatible, FR-034).
- The only consumers are the Mirror (a trend line placed _against_ the proxy gauges) and stage-gate reviews. It never enters AI prompt context.

Non-goals (binding):

- Expanding the scale beyond 3 points or the frequency beyond monthly sampling without an owner ADR.
- Sentiment analysis or mood tracking (stays in the graveyard — this is a compass check, not a diary).
- Feeding the gauge into any automated proposal or recalibration.

---

### FR-034 (approved contract) — Sanctuary (what the system must not see)

**Priority:** SHOULD

**Stage:** Doctrine now; the sanctuary mark is a small Stage 2 build.

Rationale: a life-operating system's terminal failure mode is totalization — treating a life as its captured portion, an unrecorded span as an empty one. Guaranteed blind spots are what make full capture _safe_: the operator can give the system the whole workload precisely because it has no appetite for the whole self.

Acceptance criteria:

- **Absence of data is never evidence.** No surface, metric, brief, or AI prompt may treat uncaptured time as idle, wasted, or missing. Mirror inflow gauges measure the _system's_ health, never the person's.
- **Off-the-record is a first-class mark** on areas, days, or captures: excluded from all AI context (the INV-9 hard floor), and exempt from every aging, compost, rollup, and person-side Mirror computation. One shared exclusion predicate applied everywhere, fixture-proven — a sanctuary row reaches no prompt, draft, or scan.
- **The system never solicits more visibility.** Prompts of the form "you haven't logged X lately" are prohibited at every initiative rung. Coverage expands only when the operator volunteers it.

Non-goals (binding):

- Softening the no-solicitation rule for "helpful" cases — that _is_ the rule.
- Any analytics that infer over sanctuary-marked or uncaptured spans.

---

### FR-035 — Closure Ritual (dignified endings)

**Priority:** SHOULD

**Stage:** Approved contract — owner ratification is complete. Its product dependencies are met: weekly rollups (Stage 1 slice S8), the monthly rollup surface (issue #486, merged #512), and wins (`win_records`, slice S7) are live. Implementation remains issue-gated.

Rationale: the one-in-one-out load rule has no graceful exit; today projects and areas end by silent abandonment, which is exactly how guilt accretes. Quitting well is a skill the operator's profile records as never taught; the system can make it a ceremony instead of a shame.

Acceptance criteria:

- Closure is an explicit, operator-initiated operation on any project or area — never automatic, never triggered by aging, inactivity, or any other proactive surface (Initiative Ladder, FR-032, does not raise this above I0/user-initiated).
- The system drafts a post-mortem covering three things: what the project/area was for, what got done, and one lessons line. The draft is presented as a single L1 proposal (ADR 0002 D1 — the owner approves the whole draft in one pass; this is never a pre-filled auto-execute L2 default). On approval it persists as `closure_summary` on the project/area row (additive; see `docs/DATA_MODEL.md` 4.17 sketch).
- On approval, wins worth keeping are extracted into the existing wins log — `win_records` (FR-020, shipped slice S7; `createWinRecord` in `apps/web/src/lib/data/workflow/rollups.ts`) — through the same user-confirmed-only path already shipped for weekly review. Closure does not bypass or duplicate that gate, and adds no parallel wins mechanism.
- Terminal status is a binary choice the operator makes as part of the one-pass approval: **COMPLETE** (it did its job) or **RELEASED** (we chose to stop). The status **"failed" does not exist** — no code path, schema value, or copy string may express it; the COMPLETE/RELEASED distinction is the feature, not a euphemism for one.
- Archive follows: closure always ends with the project/area in its existing terminal archived state — `status = 'archived'` for projects, `is_active = false` for areas (both existing values; no new status is introduced, per `docs/DATA_MODEL.md` section 11's guardrail against status expansion). What distinguishes a ritual closure from an ordinary archive/deactivate (FR-001's existing plain toggle, unchanged) is the populated `closure_type` + `closure_summary` + `closed_at` recorded alongside it.
- As an AI judgment surface, the ritual is born instrumented per NS-INV-3 from its first merge: stable policy id `closure_ritual.v1`, a `suggestion_records` row for the drafted post-mortem, and an `override_records` row for any hand-edit or hand-written replacement.
- Degradation: if the AI post-mortem draft fails or is unavailable, the operator writes the post-mortem by hand on the same one-pass approval surface. Closure is never blocked by AI availability (NFR-004 precedent).

Non-goals (binding):

- Auto-running closure on any trigger (aging, inactivity, rupture protocol, or any other proactive surface) — always operator-initiated.
- Any penalty, score, or "abandoned"/"failed" framing, in copy or in data.
- Bulk closure (closing multiple projects/areas in one action) — v1 is one closure, one ceremony, one post-mortem.
- Deleting any data. Closure archives; it never deletes captures, tasks, wins, or history.

---

### FR-036 (approved contract) — Compost (guilt-free capture aging)

**Priority:** SHOULD

**Stage:** Stage 1-adjacent / Stage 2.

Rationale: refusal's gentle twin at the inbox. The same operator trait that makes WIP refusal necessary (FR-022) makes inbox dread real: aged captures become guilt objects, and inbox-guilt kills the capture habit (the predecessor system's death spiral). Capture ubiquity (FR-027) is only safe at volume if aging is guilt-free.

Acceptance criteria:

- Untriaged captures older than a threshold (default 14 days, config not prompt) move to status `composted` (additive) — a searchable, tagged archive, with explicitly blame-free copy ("kept, findable, owes you nothing").
- Close shows a one-line compost count for the period, never a list. Resurrection is one tap (search → re-capture).

Non-goals (binding):

- Any listed backlog, badge, or unread count of composted items.
- Treating a composted capture as a missed task (it was a thought, not a commitment).

---

### FR-037 (approved contract) — Adaptive Surface Area (rupture protocol)

**Priority:** SHOULD

**Stage:** Stage 2 (needs surfaces to hide — after the moments shell + S5–S9).

Rationale: the deep failure mode of every productivity system is the spiral — absence → guilt → avoidance → abandonment. Re-Entry Amnesty (FR-028) forgives the _user_ on return; nothing yet changes the _system's_ posture. Usage earned the system's complexity; disuse should shrink it. The message: the system re-earns the operator, not the reverse.

Acceptance criteria:

- On rupture (no meaningful activity ≥ 7 days, or a dismissal spike across proactive surfaces), the app reduces its own visible surface to a **minimal face**: capture + one focus item + one 2-minute first move + the re-entry ritual. Everything else is hidden, not removed; all data persists.
- Hidden surfaces return progressively as their underlying feature is re-used once; a single always-visible "show me everything" affordance restores full immediately (fallibility axiom — visible exit).
- Blame-free, system-owns-it copy; no summary of what was missed on the minimal face. Respects pre-declared absences and sanctuary (FR-034).

Non-goals (binding):

- Deleting or archiving data on rupture.
- Any missed-item count on the minimal face.
- Triggering on an operator-declared away period.

---

### FR-038 (approved contract) — Portable Life Archive (extends FR-016)

**Priority:** SHOULD

**Stage:** Now or Stage 2 (extends the existing export).

Rationale: exit-anxiety is anxiety; the system's own doctrine (reversible, non-hostage) must apply at the largest scale — LifeOS may never hold the operator hostage, including to itself. Cheap exit keeps every other promise honest.

Acceptance criteria:

- Extends FR-016: in addition to the JSON export, a human-readable archive — markdown per area/charter, plus the structured tables — generated on demand into an export directory.
- The archive format is documented as **perimeter-contract v1**: the Operator Profile export (Hermes) and any future designated-person slice are defined as _filtered slices of this one format_, never bespoke artifacts and never direct DB access.

Non-goals (binding):

- A second export mechanism that diverges from FR-016's coverage guarantees (INV-2 still governs table coverage).
- Any archive path that can include secrets or token material (FR-016's exclusion list holds).

---

> FR-039 through FR-045 are the 2026-07-10 framework-gap reservations: a section-by-section audit of the General Productivity Framework against this document found these as the only prescriptions with neither shipped code nor an existing reservation. They follow the FR-031 docs-first pattern — this text is the requirement; each build slice needs owner ratification and its actual dependencies. Under ADR 0005, only capabilities that depend on personal evidence wait for that evidence; the shared Stage label is not a blanket hold on data-independent foundations.

### FR-039 (reservation) — State-Based Task Menus (sharp / functional / fried)

**Priority:** SHOULD

**Stage:** Stage 2 (needs real execution data and a populated Operator Profile to be more than decoration).

Rationale: the daily question should be "given my current state, what useful work fits?", never "why am I failing the hardest task right now?". The Operator Profile encodes stable compensations and daily focus is calendar-load-aware, but nothing represents the operator's _current_ state — so a fried afternoon renders the same menu as a sharp morning, and the mismatch reads as personal failure.

Acceptance criteria:

- A declared, optional state — `sharp` / `functional` / `fried` — set by one tap and never solicited (FR-034 holds: no prompts to declare, and an absent declaration is never counted, shown, or treated as signal).
- When a state is declared, focus and pickup surfaces re-rank or filter the **existing** focus list by a per-task state-fit tag. The fit rules are deterministic code from task attributes (kind, duration, mechanical flag); AI may propose the tag at draft time, approved in triage like any other draft field.
- State never changes commitments: FR-022 WIP, the closed daily list, and the MIT stand. A `fried` declaration surfaces the 2-minute / admin-mechanical subset of what is already committed — it never adds work or hides obligations.
- Declared states are logged for FR-021: repeated attempts of high-demand tasks in a `fried` state become a recalibration proposal ("move this class of work to a different menu"), per the existing override-pattern mechanics.

Non-goals (binding):

- Mood tracking, energy scores, charts, or history views of states.
- Inferring state from biometrics, typing cadence, or activity signals (body-as-weather stays Stage 3+ doctrine, and even there is weather, never a score).
- Blocking any task at any state — ordering is advisory; the operator can always do anything.

---

### FR-040 (reservation) — Timer Typology (flow / sprint / minimum-start)

**Priority:** SHOULD

**Stage:** Flow-moment polish era (Stage 1-adjacent), after the scripted test plan's findings land.

Rationale: one fixed timer either guillotines productive hyperfocus or over-demands on a low day. The Flow moment already has a session concept and countdown rendering (time-blindness compensation), and the 2-minute first move already exists as a _promise_ — but there is no timer mode shaped like that promise.

Acceptance criteria:

- Three session modes at flow start: **count-up flow** (default for deep work; gentle elapsed display, nothing interrupts), **fixed sprint** (countdown, default 25 min, for mechanical/admin work), **minimum-start** (5–10 min countdown that, on expiry, offers one-tap continue-as-flow — the momentum ladder made mechanical).
- The suggested mode is deterministic from task tags (state-fit / admin-mechanical per FR-039/FR-041); the operator always overrides with one keystroke.
- Hyperfocus protection: in flow mode no non-critical surface interrupts (initiative-ladder I0/I1 discipline pre-graduation, FR-032); side-thought capture stays one keystroke and returns focus to the session.
- Session outcomes feed FR-014/FR-021 duration learning exactly as today — the typology adds no new logging surface.

Non-goals (binding):

- Forced breaks, alarms-as-guilt, or any sound/animation reward mechanics.
- A global pomodoro doctrine — mode is per-session, per-task, always operator-chosen.

---

### FR-041 (reservation) — Admin Sprint (mechanical batch mode)

**Priority:** SHOULD

**Stage:** With FR-039/FR-040 — it is the `fried`-menu × sprint-timer intersection and should land as their thin composition, not before either.

Rationale: "do admin" is not a real task. Administrative drag is only startable when expressed mechanically and numerically ("reply to 4", "file 5") and only finishable inside a cap. The objective is reduced drag, not emotional satisfaction — which is exactly why it needs a stop built in.

Acceptance criteria:

- A task can carry an `admin-mechanical` tag with a numeric unit; the parse draft may propose tag and count, approved in triage.
- An Admin Sprint launcher: select up to a small capped number of admin items, run one fixed sprint (FR-040), stop at the cap. The unfinished remainder stays as ordinary tasks, is deferred, or composts (FR-036) — an admin sprint never rolls into an open-ended session.
- Outcome is recorded as counts (x of y units), non-shaming copy, and feeds FR-021 as ordinary duration evidence.

Non-goals (binding):

- A separate admin backlog or admin surface — admin items remain ordinary tasks wearing a tag.
- Productivity scoring, throughput graphs, or sprint-over-sprint comparisons.

---

### FR-042 (reservation) — Habits (minimum version + never-skip-twice)

**Priority:** SHOULD

**Stage:** Stage 2, as an explicit scope expansion — habits are a new noun, and "habit tracker" is a graveyard-adjacent category; this FR exists precisely so the scope decision is made in this file, not in code.

Rationale: recurring practices are not tasks — missing one is a lapse, not a failure, and the design goal is fast recovery, not an unbroken record. The only habit model compatible with the permanent non-goals (streak-as-guilt is already banned in §4) is recovery-first: full version, minimum version, never-skip-twice, stable trigger.

Acceptance criteria:

- A habit is exactly: name, stable trigger (an "after X" anchor phrase), full version, minimum version (≤2 minutes, always counts as done), and the recovery rule — after one miss, the next occurrence surfaces the minimum version as the suggested move.
- Hard cap on active habits (default 3, one-in-one-out like FR-022). Habits render as small check-off affordances near their anchors on Today, never as items in the focus list — they do not interact with WIP or the closed daily list.
- A miss is recorded without color, badge, or aging; the only aggregate ever surfaced is recovery-oriented ("minimum version available today"). Habit history feeds FR-021 only as recovery-rate evidence.

Non-goals (binding):

- Streak counters, chains, or completion percentages anywhere, in any rendering.
- Red/overdue treatment of a missed habit, or auto-conversion of a missed habit into a task.
- More than the capped number of active habits, on any surface, at any trust rung.

---

### FR-043 (reservation) — Executable Goals (direction → near-term proof)

**Priority:** SHOULD

**Stage:** Stage 2 (attaches to Area Charters; meaningful only once charters hold real data after the Notion identity migration).

Rationale: charters give direction, and direction never tells today what to do. The bridge is the executable goal: **by [date ≤ 2 weeks], [specific artifact] exists and has been used once**. A direction guides; a goal produces evidence — and the wins log (FR-020) is already waiting to receive exactly that evidence.

Acceptance criteria:

- An area charter can hold at most **one** active executable goal, template-enforced: artifact, date ≤14 days out, and a used-once definition. Opening a second requires closing the first as COMPLETE or RELEASED (FR-035 semantics).
- On Today the goal renders only as quiet context on its area's tasks ("serves: proposal sent by Friday") — never a separate surface, never a nag.
- On the date, Close asks two questions: did the artifact exist, was it used once. The outcome lands in wins/evidence (FR-020); a miss routes to the recovery diagnostic (shrink / re-date / release), never to guilt copy.

Non-goals (binding):

- OKR trees, weighted scoring, cascading goal hierarchies, or more than one active goal per area.
- AI-generated goals activating without explicit operator approval.

---

### FR-044 (reservation) — Research Stop Rule (extends FR-024)

**Priority:** SHOULD

**Stage:** With FR-024's next iteration — a small additive extension, buildable whenever FR-024 is next touched.

Rationale: research continues after it stops changing the likely decision; the missing input is not information but a stopping condition. FR-024 already carries question, reversibility, and deadline. A research-flavored decision additionally needs: what evidence would change it, a time cap, and a required output.

Acceptance criteria:

- FR-024 decision objects gain optional research fields (additive columns only): research question, evidence-that-would-change-it, time cap, required output. When present, the decision surface renders the stop condition and the cap with countdown rendering (Operator Profile compensation).
- At the cap the decision enters an FR-025-style fork: **recommend now** (record the recommendation plus what would genuinely change it) or **extend once, with a written reason**. Silent continuation is not a representable state.

Non-goals (binding):

- A separate research noun, table, or surface — this is an FR-024 extension and FR-024's non-goals hold unchanged.
- AI auto-closing or auto-recommending decisions; the fork is always operator-executed.

---

### FR-045 (reservation) — Witnessed Commitments (human accountability, Hermes-relayed)

**Priority:** SHOULD

**Stage:** Stage 3 (requires Hermes channels, FR-032 initiative-ladder rungs, and the staged external-writes rung; nothing here opens earlier).

Rationale: self-accountability depends on the same executive functions that are already struggling; a dashboard seen only by its owner is easy to ignore. External accountability is borrowed structure: a named person, a date, a visible artifact, a check-in moment. LifeOS stays the sole system of record; any channel — Hermes first — only relays.

Acceptance criteria:

- A commitment (FR-017) can gain a **witness block**: named person, date, artifact or demonstration, and a check-in moment. The block lives in LifeOS tables only — the perimeter contract that Hermes never remembers commitments is binding here (two systems of record is the fragmentation death this system exists to prevent).
- All outbound witness messages (invite, deadline notice, check-in) are draft-for-approval external writes under Stage 3 rules: rendered, editable, explicitly sent by the operator. Auto-send is reachable only by trust-ladder graduation on accumulated decision data, and interruption timing is governed by the FR-032 rung then in effect.
- The check-in renders in Close/Review with three first-class outcomes: **kept / renegotiated / released** — renegotiation is a legitimate outcome with non-shaming copy, because accountability is borrowed structure, not punishment.
- Body doubling and presence remain Hermes-side (sibling system) permanently; LifeOS may record that a session happened only if the operator captures it like any other capture.

Non-goals (binding):

- Public commitment feeds or social mechanics of any kind.
- Witness-visible dashboards or any witness access into LifeOS — a future witness-facing view, if ever, is a filtered FR-038 archive slice and requires its own FR first.
- Punitive framing, consequences, or escalation mechanics on a missed commitment.
- Hermes-side storage of commitments, deadlines, or witness identity beyond the in-flight message being relayed.

---

### FR-046 — Outbound Telegram Daily Brief (Stage-3 rung 1)

**Priority:** SHOULD

**Stage:** Approved external-channel contract — owner-ratified 2026-07-09 through issue #485. Implementation still depends on FR-032's class-specific evidence and trust graduation, external-channel security review, explicit credential opt-in, and the declared build order: pure composer/sender module first, then env-gated wiring.

Rationale: the daily brief only reduces anxiety if it is seen, and the owner's day does not start inside the app. Pushing the same deterministic brief the Start moment already renders to a channel the owner already opens (Telegram) moves the brief to where attention already is, without adding an AI voice, an inbound command surface, or a second system of record. This is deliberately the smallest possible outbound rung: one message, one recipient, fixed cadence, wholly inert unless the owner has physically wired the channel.

Acceptance criteria:

- **Content parity, no AI prose:** the message body is composed by pure code from the same deterministic day-synthesis data the Start moment renders (blocks, focus budget, waiting-on, first move) — no LLM call anywhere in the path (usability > enjoyability precedent; FR-022 enforcement-in-code precedent).
- **Owner-only, outbound-only:** the sender posts to exactly one chat id (`TELEGRAM_CHAT_ID`) via the owner's own bot token (`TELEGRAM_BOT_TOKEN`). No inbound message is read, parsed, stored, or acted on at this rung — inbound handling is a later trust-ladder rung requiring its own FR. Ignoring inbound also closes the prompt-injection surface (INV-8 posture) by construction.
- **Wholly inert without opt-in:** if either secret is absent the feature does not run, log, warn, or render — physical credential provision is the standing consent that unlocks it, and deleting either secret is the standing revocation (demotion path).
- **Initiative-ladder reconciliation (FR-032):** this is an I3-class surface. Owner ratification approves the contract but does not substitute for class-specific evidence or explicit trust graduation; credential opt-in is necessary consent, not sufficient graduation evidence. Once those gates are met, the surface remains **at most once per day on a fixed schedule**, never event-triggered or engagement-timed. Any second message class (nudges, alerts, replies) requires a new FR and the FR-032 rung then in effect.
- **Failure isolation:** send failures are caught, logged server-side, and never affect app health, the brief's in-app rendering, or any other surface. Timeouts are bounded; the sender never throws into a caller.
- **Secrets discipline:** both values are server-side environment variables per SECURITY_PRIVACY §9 — never committed, never client-visible, never sent to AI, rotated if exposed.

Non-goals (binding):

- Inbound Telegram commands, replies, or capture — any inbound behavior is a separate FR on a later trust rung.
- AI-generated or AI-personalized message content.
- Additional recipients, group chats, or channel posts.
- Any second scheduled or event-triggered message class (this FR covers exactly one daily brief).
- Delivery/read receipts feeding any engagement metric (permanent non-goals apply).

---

### Constraint Layer — Explicitly Unapproved Capabilities

The following feel productive to build but remain unapproved (owner-ratified 2026-07-05): people pages / CRM views, relationship radar, health-score dashboards beyond the existing dot rendering, template libraries, and Notion-parity database views. The predecessor system already provided these; they are capability, not constraint, and did not move the bottleneck. Building any of them requires an explicit requirements amendment; ADR 0005 does not silently authorize them.

---

### Product Loop and Autonomy Boundary

The baseline product loop is: capture messy input, diagnose ambiguity, bound the work, slice it into a reversible next move, discover missing information, act, and review the outcome. Requirements that support AI assistance must preserve this ambiguity-to-motion loop instead of turning LifeOS into a generic task list or autonomous agent.

Autonomy is intentionally tiered:

- AI may parse, classify, assess ambiguity, and suggest next moves.
- Rule-based code may score, surface patterns, and produce learning signals from approved logs.
- External calendar writes, core policy changes, and destructive archive/delete behavior require explicit user action.

When work is uncertain, the system should help the user distinguish facts, assumptions, guesses, unknowns, constraints, reversible versus irreversible actions, and what not to do yet before encouraging commitment to a plan. Planning output for ambiguous work must include a next action, timebox, confidence level, known unknowns, review trigger, and what not to do yet.

## 3. Non-Functional Requirements

### NFR-001 — Low Cost

- Use free/low-cost hosting where possible.
- Avoid realtime voice unless explicitly approved through requirements review.
- Avoid web search in app runtime.
- Avoid vector databases unless a reviewed requirement proves simpler storage cannot meet the need.
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

- Keep the baseline at **six primary workflow screens**: Capture, Triage, Calendar / Planning, Execute, Review, Health. **Settings** (areas, policies, integrations) is **secondary / admin** and does not count toward this limit. Expanding primary navigation requires an explicit UX and requirements decision, not merely a later stage label.
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

The shipped baseline excludes the following. They remain unapproved until a reviewed requirements amendment explicitly admits a bounded slice:

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

### Permanent non-goals (binding beyond V1 — the graveyard)

These do not expire with V1; building any requires reopening this section first (per the constraint-over-capability axiom):

- **Visibility solicitation** — the system never asks the operator to log, explain, or account for uncaptured time (FR-034).
- **Engagement-bait copy or mechanics** — variable-reward timing, streak-as-guilt, manipulative nudging. Delight, if built, must be true (evidence-generated), rare, and budgeted on the initiative ladder (FR-032).
- **Health scores / quantified-self** — any wearable or health data enters as one-way capture rendered as day-condition "weather" only; no scores, streaks, optimization loops, or health advice.
- **Household / multi-person management** — one dyad per spine. Other people interact with the _perimeter_ (their requests enter as captures; visibility scoped to commitments that name them); LifeOS never becomes a household-management or anyone-else's-time surface. A second person gets a second spine.

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
