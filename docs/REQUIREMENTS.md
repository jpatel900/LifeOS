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

### FR-031 (reserved) — Task-Map v1

FR-031 is reserved for the task-map contract plan (progression-map / breakdown work), not yet landed. It is referenced here only to record the renumbering: the daily-driver floor (FR-027..030) claimed the FR-027..030 slots ahead of the previously-numbered task-map draft, which now lands as FR-031 when its own docs-first slice is integrated. No task-map requirements text is adopted by this entry.

---

### Constraint Layer — Deferred Capabilities

The following feel productive to build and are explicitly deferred (owner-ratified 2026-07-05): people pages / CRM views, relationship radar, health-score dashboards beyond the existing dot rendering, template libraries, and Notion-parity database views. The predecessor system already provided these; they are capability, not constraint, and did not move the bottleneck. Building any of them requires reopening this section first.

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
