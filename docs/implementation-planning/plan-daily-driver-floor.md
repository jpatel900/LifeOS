STATUS: COMPLETE — shipped as of 2026-07-08; kept for reference.

# Implementation Plan — Daily-Driver Floor (G1–G4: the four silent saboteurs)

Status: Planning artifact (READ-ONLY). Author: Reliability/Adoption Architect.
Owner: jpatel900. Ratified framing: build the "daily-driver floor" BEFORE further behavioral features.
Binding: matches the REQUIREMENTS.md constraint-layer house format (Priority / Stage / Rationale / Acceptance criteria / Non-goals — as FR-022..026 use, NOT the older MUST/SHOULD/NON-GOALS subhead style); harmonizes with — does not contradict — FR-022..026 (constraint layer), the moments-shell plan (P0–P7), the task-map contract plan, ADR 0002/0003, NS-INV-1..9, UX-INV-1..6, perimeter rules, NFR-001.

> Renumbering note (binding): the floor lands FIRST, so it claims **FR-027 (G1), FR-028 (G2), FR-029 (G3), FR-030 (G4)**. The task-map FR therefore renumbers to **FR-031**.

---

## 0. Grounding — what already exists (verified against origin/main + branches; do not rebuild)

Read-only verification (git show origin/main:... and `origin/docs/constraint-layer-frs`):

- **Persistence-vs-demo signal already exists and is clean.** `apps/web/src/lib/data/workflow.ts` defines `DataProvider = "mock" | "supabase"`; every data fn branches `if (!client) return { provider: "mock", ... }`. `apps/web/src/lib/supabase/config.ts::isSupabaseConfigured()` and `getSupabaseConfig()` return `null` when `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are absent → `createSupabaseBrowserClient()` returns `null` → mock. `apps/web/src/lib/data/health.ts` already emits `mode: "mock_only"` / `persistence: "persisted"|"unavailable"` (the H2 truthful-`/health` work). **G3(a) reuses `provider === "mock"` as the single source of truth — it does not invent a new signal.**
- **Session client is the G3(b) bug locus.** `apps/web/src/lib/supabase/browser.ts` calls bare `createClient(url, anonKey)` with **no auth options** — no `persistSession`, no `autoRefreshToken`, no `storage`, no `@supabase/ssr` cookie handling. SECURITY_PRIVACY §3 requires "sessions must be handled through secure client libraries." This is why sessions do not survive weeks; the fix is config on this one file (+ possibly an SSR middleware refresh).
- **Capture UI lives inside the hot file.** `apps/web/src/app/capture/page.tsx` is a 3-line shim → `<CockpitRoute stage="capture" />`; the actual capture surface + `submitCaptureText` is in `LifeOSCockpit.tsx` (~1600 lines, hot file — one change at a time per ADR 0003 D5 / MEMORY) with the data spine in `WorkflowContext.tsx`. **The moments plan moves capture out of `LifeOSCockpit` into `CaptureOverlay` at packet P7.** Floor work that touches capture must therefore attach at the **flip-invariant spine layer** (`WorkflowContext.submitCaptureText` + a data-lib), which the moments plan explicitly leaves untouched ("no packet edits `WorkflowContext.tsx`"), NOT at the `LifeOSCockpit` UI — otherwise P7 redoes it.
- **Parse status + auto-degrade already exist (G4 hooks).** `apps/web/src/lib/ai/parseCaptureService.ts` exports `getParseCaptureStatus()` → `"mock" | "ai_configured" | "ai_unavailable"` (ENV-ONLY: key present? model resolved?) and `parseCaptureWithFallback()` which already degrades to mock when key/enable absent. **Gap:** the status check is blind to a *runtime* 429 while configured — the exact OpenAI-down incident G4 exists for. `route.ts` (`/api/parse-capture`) already surfaces `ParseCaptureRuntimeStatus` on GET.
- **`ai_call_traces` table already records the near-free canary signal.** Migration `supabase/migrations/20260704120000_add_ai_call_traces.sql`: columns include `latency_ms int not null`, `status`, `surface`, `prompt_version`; `parseCaptureService` writes one metadata-only fire-and-forget row per real parse (`recordTraceRow({status:"passed"|"failed"})`). **G4's canary reads recent recorded outcomes (cheap GET) and only POSTs a synthetic parse when there is no recent real signal** — this is the "near-free but not blind" reconciliation.
- **House watchdog/cron pattern (G4 reuses verbatim).** `.github/workflows/pipeline-advance.yml`: `on.schedule.cron` + `workflow_dispatch` + `concurrency` group + `permissions: issues: write` + `actions/github-script` posting to issues; marked **T2 (human review to change)** by `.github/AGENT_AUTOMATION_POLICY.md`. `.github/workflows/migration-drift.yml`: skip-with-`::warning::` when the secret is absent, `::error:: + exit 1` on failure (red workflow = owner-visible), read-only prod DB access, ~5s cheap check. G4 = migration-drift's shape (cheap scheduled probe, skip-if-no-secret) + pipeline-advance's issue-raising.
- **Constraint-layer additive shapes already specced (DATA_MODEL §4.14, constraint branch).** `capture_items.return_hook` (FR-026/#368), `tasks.first_tiny_step` / `definition_of_done` / `task_type` / `is_reversible` / `constraint_json` (FR-023/024/025), `execution_sessions.cap_outcome` (FR-025). WIP (FR-022) adds **no columns** — derived count + `wip_enforcement.v1`/`dod_cap.v1` policy ids. The floor adds its own small additive shapes in the same §4.14 style.
- **Privacy facts binding on G1/G3 (SECURITY_PRIVACY).** Raw captures = **High** sensitivity ("may include private thoughts"). OAuth tokens = **Critical, server-side only, never to frontend**. Retention §10: "raw text captures retained until user archives/deletes"; §13 Privacy UX asserts "**raw capture survives AI failure**" and §11 "**preserve raw capture before AI parsing**" — G1's offline queue *strengthens* these to "raw capture survives being offline / survives the device." §6.4 prompt-injection containment (captured text is data, never instructions) must hold for offline-then-synced captures too.

Implication: the floor is **~config + small spine-layer guards + one new component family + one new workflow** — not a rewrite. Every locus above is already the right seam.

---

## 1. FR drafts (exact REQUIREMENTS.md house format: Priority / Stage / Rationale / Acceptance criteria / Non-goals — matching FR-022..026)

> Format note: FR-022..026 use `Priority` / `Stage` / `Rationale` / `Acceptance criteria:` (bulleted) / `Non-goals:` — NOT `MUST/SHOULD/NON-GOALS` subheads. These four match that structure verbatim.

### FR-027 — Capture Ubiquity (installable + offline raw-capture)

**Priority:** MUST

**Stage:** Daily-driver floor (owner-ratified 2026-07-04; lands before further behavioral features). Same capture/parse surface as FR-026 — see reconciliation note.

Rationale: capture today is a desktop web tab; thoughts arrive on the phone and mid-task. A capture that is not reachable at the moment of the thought is a capture that never happens — the highest-frequency adoption saboteur. This is **not a new perimeter integration**: it is the same spine capture surface made reachable and resilient. It is the raw-save-first complement to FR-026 containment, not a competitor to it.

Acceptance criteria:

- The web app is installable as a PWA (web app manifest + service worker) so capture opens from a phone home-screen icon in one tap, and registers as a **share target** so text shared from another phone app lands directly in a raw capture.
- **Offline raw capture is save-first with no parse wait.** When offline (or when the user chooses "save raw"), the capture is written to a device-local queue immediately and the interaction ends — there is NO spinner, NO parse wait, NO "notify me later" (consistent with FR-026's prohibition of fire-and-forget async: the offline path resolves *synchronously as saved-raw*, it does not go pending-async).
- Queued raw captures sync to the spine (`capture_items`) automatically when connectivity returns; **parse happens at triage**, not at sync time. Sync is idempotent (a client-generated `client_capture_id` dedupes replays).
- A queued-but-unsynced capture is never silently lost and its unsynced state is visible (count/badge); loss of the device before sync is the only unrecoverable case and the queue is durable across app restarts until synced.
- The PWA is a **capture + read reach extension only**. It introduces no new write path to the spine beyond the existing authenticated `capture_items` insert; it holds no OAuth tokens and no service keys (NS-INV-9 perimeter containment holds even though the PWA is first-party).
- When the user is *in* the capture surface awaiting a parse (online, chose to parse now), **FR-026 containment applies unchanged** (return hook visible, no second capture, synchronous degrade). FR-027 governs only the raw-save / offline / share-target entry paths where there is no parse wait at all.

Non-goals:

- Any new ingestion channel, messaging bridge, or third-party integration (that is Stage-3 perimeter, gated separately — a first-party PWA is not a perimeter channel).
- Background sync that parses without the user (parse stays a triage step; the queue only transports raw text).
- Offline editing/triage/planning (offline scope is raw capture only in v1).
- Push notifications.
- A capture queue *while online and awaiting parse* (FR-026 forbids that; the offline queue is a distinct raw-transport buffer, not an online parse queue).

---

### FR-028 — Re-Entry Amnesty (return without a guilt wall)

**Priority:** MUST

**Stage:** Daily-driver floor. Extends UX_FLOWS Flow 8 (missed-block recovery) philosophy — does not fork it.

Rationale: after days away, the app currently greets the returning user with a wall of overdue/red — the single most common cause of abandonment for this operator profile. A return after an absence must lower activation energy, not raise it. This is Flow 8's "a missed block is not a failure" doctrine, batched across an absence.

Acceptance criteria:

- On the first open after an absence of **>= N days** (default N configurable in settings, seed N = 3), the app runs a deterministic, rule-based **return ritual** instead of the normal today view.
- Scheduled blocks whose time has fully passed during the absence are **auto-deferred** to an unscheduled/backlog state by a deterministic rule (no AI), and **every such deferral is enumerated in the "while you were out" summary** — it is a reversible internal status transition surfaced in a batch, not a silent write (see NS-INV-4 reconciliation §3). No external calendar mutation occurs (any calendar change remains a Flow 8 proposal).
- The backlog is collapsed into a single **"while you were out" summary** (counts + the deferral list + the one stalest thing) rather than an item-by-item overdue list.
- The ritual surfaces **exactly one recovery proposal** — a single suggested first move to re-enter — as an L1 proposal the user accepts, edits, or dismisses (never auto-started).
- **Zero red on screen** during the ritual: no overdue badges, no failure language, no penalty framing (UX_FLOWS principle: no guilt/penalty language).
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

Rationale: (a) the app can run in a browser-only demo fallback that *looks identical* to the persisted app — a user can capture for days into memory that evaporates on reload, the most corrosive possible trust failure. (b) The Supabase session does not survive weeks, so a returning user is bounced to login and loses the "what now" in one action. Both are silent, both kill daily trust.

Acceptance criteria:

- **Loud non-persistence.** Whenever the data provider is the browser-only demo fallback (`provider === "mock"` — the existing signal in `workflow.ts`/`health.ts`), the capture surface (and other write surfaces) render an **unmissable, persistent** non-persistence indicator ("Demo mode — nothing here is saved") that cannot be mistaken for the normal persisted UI. The surface **refuses to look normal** in this state (UX_FLOWS truthful-surface / UX-INV-6).
- Demo mode is never entered *silently*: per VERCEL_PRODUCTION_CHECKLIST §1, a production deploy with missing `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` **truthfully degrades to Demo mode on the affected surfaces** (the checklist deliberately does NOT fail the build closed) — so FR-029's job is to make that degrade *loud and unmissable on-surface*, not to block the deploy. The loud banner IS the production safeguard; there is no fail-closed build gate to add (that would contradict the checklist's "truthfully degrades" doctrine).
- **Session longevity.** The Supabase browser session is configured to persist and auto-refresh through a secure client library (SECURITY_PRIVACY §3) so a returning user within a multi-week window is not forced to re-authenticate; the session survives normal browser restarts.
- **Fast "what now".** On open with a live session, the primary "what now" surface is interactive within **~3s** on a warm load.
- Session/token handling continues to obey SECURITY_PRIVACY: no tokens in logs, no tokens to AI, no service-role key client-side; session storage uses the secure client-library mechanism (cookies via `@supabase/ssr` or the library's `persistSession` storage), not hand-rolled token stashing.

Non-goals:

- "Remember me forever" / non-expiring sessions (respect Supabase refresh-token lifetime; longevity means "survives weeks," not "never expires").
- Offline auth or local credential storage beyond the client library's own session store.
- A second persistence backend or local-first sync engine (that is not this floor).
- Making demo mode *unavailable* — it stays as the deterministic offline/dev fallback; it is only made *loud*.

---

### FR-030 — Provider Canary + Mock-First Auto-Degrade

**Priority:** MUST

**Stage:** Daily-driver floor.

Rationale: a real incident (OpenAI 429 for hours) was discovered only by manual probing. A provider that is silently down turns every capture into a failed parse with no signal. A scheduled canary + automatic degrade closes both the detection gap and the user-facing blast radius.

Acceptance criteria:

- A scheduled GitHub Actions cron probes the production parse path (and other provider paths as they are added) on a fixed interval, reusing the house watchdog pattern (`migration-drift.yml` shape: skip-with-warning when the required secret is absent; `::error:: + exit 1` on failure so the run goes red).
- On a **detected failure state transition** (healthy→failing), the canary raises a **GitHub issue** (the house alert channel, per `pipeline-advance.yml`'s issue-write pattern) — it does not spam an issue every run.
- The probe is **near-free (NFR-001):** it first reads recent recorded real-parse outcomes from `ai_call_traces` (a cheap read; `latency_ms`/`status` already recorded fire-and-forget per real parse); it issues a **synthetic real parse POST only when there is no recent real signal** or to confirm a suspected transition. It never runs a paid parse on every tick.
- **Mock-first auto-degrade.** When the provider is known-down (canary-detected or runtime 429 observed), the parse surface degrades to mock/deterministic parsing automatically and visibly, rather than surfacing repeated failures — extending the existing `parseCaptureWithFallback` degrade from "key absent" to "provider runtime-down."
- The degrade and the recovery are visible on the Health surface (connector/AI-failure separation, NFR-004) and recorded so the learning loop / audit sees provider incidents.

Non-goals:

- A second AI provider / failover vendor (doctrine cap: no new vendors; degrade target is the existing mock path, not a competitor LLM).
- A paid probe on every cron tick (cost cap — synthetic POST only on transition/no-signal).
- A realtime status page or paging/on-call integration (the GitHub issue is the alert channel).
- Auto-re-enabling the provider without evidence it recovered (recovery is canary-confirmed, then auto or one-tap).

---

## 2. Implementation plan — PR-sized packets

Convention matches the moments-shell plan: packet = one PR; file-touch set marks New (N) / Edit (E); hot files (`LifeOSCockpit.tsx`, `WorkflowContext.tsx`) touched by at most one packet at a time; every packet independently CI-green (Playwright E2E + vitest). Model tier: **sonnet** = well-contracted integration; **opus** = judgment/security/schema-shape or cross-surface reconciliation (per MEMORY "Fable orchestrates, cheap models implement" — opus plans/verifies, sonnet implements contracted packets).

**Where the floor slots relative to in-flight/queued work (file-disjointness stated explicitly):**

- **S2** (contextAssembly, settings/areas UI) — floor touches none of `contextAssembly.ts` / settings-areas. **Fully disjoint. Floor can run concurrent with S2.**
- **C1–C5 (#364–#368, constraint layer)** — C5/#368 (FR-026 containment) **shares the capture surface with G1**; resolved by **merging G1's spine-layer packet with the #368 packet set** (§3 hot-spot). C1–C4 touch `tasks`/`execution_sessions`/scheduling logic — disjoint from all floor packets except the shared capture spine.
- **Moments shell P0–P7** — P0 & P7 touch `LifeOSCockpit.tsx` (hot). **Floor rule: no floor packet edits `LifeOSCockpit.tsx`.** G1 offline queue and G3(a) loud-banner attach at the **spine/data layer** (`WorkflowContext.submitCaptureText`, a new `capture/offlineQueue.ts`, `supabase/browser.ts`, `data/health.ts`) which the moments plan leaves untouched, and are surfaced by whichever UI owns capture (LifeOSCockpit pre-P7, CaptureOverlay post-P7). **Floor is P7-flip-invariant** because it lives below the UI shell. The banner/queue-badge is consumed by CaptureOverlay when P7 lands (one-line render add in the moments P2/P3 component, not a floor edit).
- **Task-map v1 (now FR-031)** — post-S3 additive on `tasks`; disjoint from floor.

### Packet table

| Packet | G | Goal | File-touch set (N=new, E=edit) | Tier | Validation lane | Disjoint / sequential |
|---|---|---|---|---|---|---|
| **F-G4a** Canary read-path | G4 | Cron reads recent `ai_call_traces` outcomes; skip-if-no-secret; red on failure. No paid call. | N `.github/workflows/provider-canary.yml`; N `scripts/agent/provider-canary.mjs` | opus (workflow = T2 human-review; security/secret handling) | Actions dry-run via `workflow_dispatch`; unit test the mjs evaluator | Fully disjoint (CI-only files). **Parallelizable with everything.** |
| **F-G4b** Synthetic probe + issue-raise | G4 | On no-recent-signal/suspected-transition, POST one synthetic parse; raise GitHub issue on healthy→failing transition (dedup by open-issue check). | E `scripts/agent/provider-canary.mjs`; N canary state note (issue label) | opus | mjs unit tests (transition dedup); `workflow_dispatch` live probe once | Sequential after F-G4a (same script). |
| **F-G4c** Runtime auto-degrade | G4 | Extend `parseCaptureWithFallback`/status to treat runtime 429/provider-down as degrade-to-mock (visible); Health shows provider-down. | E `apps/web/src/lib/ai/parseCaptureService.ts`; E `apps/web/src/app/api/parse-capture/route.ts`; E `apps/web/src/lib/data/health.ts` | opus (touches parse service contract + degrade correctness) | vitest `parseCaptureService.test.ts` (add 429 case); `health.test.ts` | Disjoint from G1/G2/G3 files. Sequential-internal (one PR). |
| **F-G3a** Session longevity config | G3 | Configure `createSupabaseBrowserClient` for `persistSession`+`autoRefreshToken` via secure lib (`@supabase/ssr` cookies or explicit storage); add SSR refresh middleware if needed. | E `apps/web/src/lib/supabase/browser.ts`; poss. N `apps/web/src/middleware.ts`; E `apps/web/src/lib/supabase/config.ts` | opus (auth/session security; SECURITY_PRIVACY) | vitest session-config test; manual multi-restart check; E2E login-persist smoke | Disjoint. Parallelizable. |
| **F-G3b** Loud non-persistence | G3 | Persistent "Demo mode — nothing saved" banner driven by `provider==="mock"`; refuse-to-look-normal styling; production-missing-config surfaced. | N `apps/web/src/app/components/DemoModeBanner.tsx`; E the layout/shell mount point (`AppShell.tsx` — NOT LifeOSCockpit); E `data/health.ts` (production-config guard) | sonnet (contracted; signal already exists) | RTL banner test (mock vs supabase); E2E degraded-mode smoke (`degraded-modes.smoke.spec.ts`) | Disjoint from LifeOSCockpit. Parallelizable. `AppShell.tsx` shared only with moments P7 — sequence: land F-G3b before moments P7 or rebase. |
| **F-G2a** Re-entry detection + summary | G2 | Deterministic absence detector (>=N days, settings-seeded); "while you were out" summary read-model (counts + deferral list + stalest). No writes. | N `apps/web/src/lib/reEntry/detect.ts`; N `apps/web/src/lib/reEntry/summary.ts` (pure selectors over WorkflowContext state) | sonnet (pure, contracted) | vitest pure-selector tests (absence boundaries, empty/degraded) | Disjoint (new lib files). Parallelizable. |
| **F-G2b** Auto-defer rule + records | G2 | Deterministic auto-defer of fully-lapsed scheduled blocks to backlog; enumerate in summary; write `re_entry.v1` suggestion/override records; NO calendar write. | E `apps/web/src/lib/data/workflow.ts` (defer action — additive) OR N `reEntry/defer.ts`; N migration if a `re_entry_events` note needed (prefer records-only) | opus (NS-INV-4 reconciliation correctness; write-path review) | vitest defer-rule tests; record-write tests | Sequential after F-G2a. Touches `workflow.ts` — disjoint from moments (which never edits data-lib) but coordinate with C1–C4 if they also add `workflow.ts` actions (additive, low risk). |
| **F-G2c** Re-entry ritual UI | G2 | Render the ritual (summary + one recovery proposal, zero red) as a Today-state; one L1 proposal accept/edit/dismiss. | N `apps/web/src/app/components/ReEntryRitual.tsx`; E capture/today host (post-P7: a moment state; pre-P7: a `LifeOSCockpit` today branch) | sonnet | RTL ritual test; E2E re-entry journey (new spec) | **Sequence vs P7:** if built pre-P7 it edits `LifeOSCockpit` (hot) → must serialize with P0/P7; **recommend building F-G2c AFTER moments P3** so it lands as a moment state (no LifeOSCockpit edit). See §4. |
| **F-G1a** Offline raw-capture queue (spine) | G1 | Device-local durable queue (IndexedDB); `submitCaptureText` writes queue-first when offline/save-raw; idempotent sync on reconnect via `client_capture_id`; unsynced-count signal. | N `apps/web/src/lib/capture/offlineQueue.ts`; E `apps/web/src/lib/WorkflowContext.tsx` (submit path — hot spine, but moments leaves it untouched); N migration `capture_items` add `client_capture_id` (additive, unique dedup) | opus (offline correctness, dedup, privacy of at-rest raw captures, WorkflowContext hot spine) | vitest queue tests (offline→sync, dedup, restart durability); RLS/export coverage check for new column | **Merge with C5/#368 packet set** (§3): FR-026 return_hook + FR-027 queue are the same `submitCaptureText`/`capture_items` surface. Sequence: **land after or with #368**, never concurrent on `capture_items`/`submitCaptureText`. |
| **F-G1b** PWA install + share-target | G1 | Web app manifest, service worker (offline shell + queue flush), share-target registration; install affordance. | N `apps/web/public/manifest.webmanifest`; N `apps/web/src/app/sw.ts` (or `public/sw.js`); E `apps/web/src/app/layout.tsx` (manifest link + SW register); N share-target route `apps/web/src/app/api/share-target/route.ts` or `app/capture/share/page.tsx` | opus (service-worker caching correctness is a known footgun; must not cache stale app / must not become a second write path — NS-INV-9) | Lighthouse PWA-installable check; E2E offline-capture-then-sync; SW-scope test | Sequential after F-G1a (SW flushes the queue). Disjoint from all non-capture files. |
| **F-G1c** Privacy addendum + docs | G1 | SECURITY_PRIVACY addendum: device-local raw-capture queue is High-sensitivity, purged on sync, cleared on logout, no tokens in queue; DATA_MODEL §4.14 `client_capture_id` note. | E `docs/SECURITY_PRIVACY.md`; E `docs/DATA_MODEL.md`; E `docs/REQUIREMENTS.md` (adopt FR-027..030) | opus (privacy judgment) | doc-lint / cross-ref check | Docs-only; sequence FIRST for the FRs (REQUIREMENTS-first, AGENTS.md rule 13), the privacy addendum lands with F-G1a. |

**Parallelizable set (fully file-disjoint, can run concurrently):** F-G4a, F-G3a, F-G3b, F-G2a. These share no files and no hot surfaces.
**Sequential chains:** G4: F-G4a→F-G4b, F-G4c independent. G2: F-G2a→F-G2b→F-G2c(after moments P3). G1: F-G1c(FR-first)→F-G1a(with #368)→F-G1b.

**Docs-first gate (AGENTS.md rule 13 / ADR 0002 D5):** FR-027..030 text + DATA_MODEL §4.14 additions (`capture_items.client_capture_id`, `re_entry` records via existing suggestion/override vocab, no new tables preferred) land in REQUIREMENTS/DATA_MODEL **before any implementation packet**, with a dated decision-log entry in the floor's tracking issue. This is F-G1c's REQUIREMENTS portion, pulled to the front.

---

## 3. HARMONY MATRIX

Legend: **C** = compatible (no interaction) · **S** = synergy (strengthens each other) · **X** = CONFLICT (carries a resolution, never a hand-wave).

| Axis | G1 Capture Ubiquity | G2 Re-Entry Amnesty | G3 Persistence Truth + Session | G4 Provider Canary |
|---|---|---|---|---|
| **Stage 1 S3–S9** | C — G1 transports raw text; parse (S3) unchanged, runs at triage as always. | S — G2's summary read-model reuses S4 aging / S6 brief selectors; extends, no new fetch. | C — session/persistence is below the slice layer. | S — G4 protects the S3 parse path all slices depend on; degrade keeps S-work usable during an incident. |
| **C1–C4 (#364–#367 WIP/gate/decision/DoD)** | C — different surface (`tasks`/`execution_sessions`); G1 is `capture_items`. | **X (WIP) + S (gate)** — G2 auto-defer moves blocks out of the committed set; FR-022 WIP counts that set. *Resolution:* auto-defer only *reduces* the committed count (frees slots) — it can never exceed WIP=3, so it is always WIP-legal; G2 defers BEFORE presenting the ritual so the returning user is under-cap, not refused. And the **single recovery move, on accept, follows the normal activation path** — so it inherits FR-023's launch-sequence gate (`first_tiny_step` required to commit) and the FR-022 WIP check like any other commitment: **no special-cased path**, no bypass of C1–C4. FR-024/025 (decision/DoD) don't fire during re-entry. | C. | C. |
| **C5 / #368 (FR-026 containment)** | **X (hottest)** — same capture surface + same `capture_items` + same `submitCaptureText`. *Resolution:* **merge into one packet set.** FR-026 = the *online, awaiting-parse* path (containment, return hook); FR-027 = the *raw-save / offline / share* path (no parse wait). They are complementary halves of one surface: F-G1a lands with/after #368, `return_hook` and `client_capture_id` added to `capture_items` together, one owner for `submitCaptureText`. Contract line: "online-parse ⇒ FR-026 containment; save-raw/offline ⇒ FR-027 queue; never both waiting at once." **Fallback cost (state to owner):** if the two cannot land together and #368 merges first, adding `client_capture_id` to the now-frozen `capture_items` shape crosses **NS-INV-7** (frozen contract) → requires an epic decision-log entry + human approval. The preferred land-together path avoids this; the fallback carries that gate. | C. | C. |
| **Moments shell P0–P7** | **X** — capture UI moves LifeOSCockpit→CaptureOverlay at P7. *Resolution:* G1 attaches at the **spine/data layer** (`WorkflowContext`+`offlineQueue.ts`+SW) that moments explicitly leaves untouched; the queue-badge/offline affordance is a one-line render in CaptureOverlay (moments P2/P3), so P7 does not redo G1. | **X** — F-G2c ritual is a Today-state; pre-P7 that edits hot `LifeOSCockpit`. *Resolution:* build F-G2c **after moments P3** so the ritual is a moment state (Start-moment variant), zero LifeOSCockpit edits, zero hot-file contention. | **X (mild)** — F-G3b banner mounts in `AppShell.tsx`, also touched at P7. *Resolution:* land F-G3b before P7 or rebase the one-line mount; banner is provider-signal-driven so it is shell-agnostic. F-G3a (browser.ts) is fully disjoint. | C — CI-only + parse-lib files; no UI shell overlap. |
| **Task-map v1/v2 (FR-031)** | C — task-map is `tasks.progression_map`; G1 is `capture_items`. | S — a re-entry recovery move can point at a task's first node; reuses map, no new surface. | C. | S — task-map annotations ride the same parse call G4 guards; canary protects both. |
| **NS-INV-1..9** | S(INV-9) — G1 PWA is first-party capture reach; explicitly holds no tokens/keys/extra-write-path, *reinforcing* perimeter containment doctrine. S(INV-8 one-in-one-out): PWA retires the "desktop-tab-only capture" load. INV-2 additive: `client_capture_id` additive column, export coverage inherited (`capture_items` in export set). | **X (INV-4 no silent writes)** — auto-defer IS a write. *Resolution (explicit):* auto-defer is a **deterministic, rule-based, internal, reversible status transition, enumerated in the summary** — NOT an AI-generated artifact and NOT an external write. NS-INV-4 governs *AI-generated* artifacts (propose→approve→persist) and external writes stay Flow-8-proposal-gated. A rule-based local defer that is (a) deterministic, (b) reversible, (c) surfaced in the "while you were out" list is a *bounded-rule exception*, not a silent write — because it is not silent (it is listed) and not AI (it is a rule). The single *recovery move* remains a full L1 proposal. This is the same class as Flow 8's "drop/defer without penalty," batched. Record via `re_entry.v1` so it is auditable. | S(INV-3 born instrumented): session/persistence surfaces feed `health_checks`; G3b makes the mock-mode truth loud, reinforcing INV-6-style honesty. | S(INV-3) — canary + degrade are born-instrumented (traces + health + issue); protects the INV-1 single parse choke point's availability. |
| **UX-INV-1..6** | S(INV-2 capture ≤1 keystroke): PWA extends capture reach to phone/share. C otherwise. | S(INV-3 no dead ends): the ritual is the anti-dead-end for "returning to a wall of red" — one forward action, zero red. S(INV-6 truthful): rule-based summary, live data. | S(INV-6 truth-bearing surfaces stay live): the loud demo banner IS UX-INV-6 applied to persistence — a surface that refuses to falsely assert "saved." | C. |
| **Perimeter rules (D2 / Stage-3 Hermes)** | **X (the trap)** — a PWA could become a second write path or blur the spine/perimeter line. *Resolution:* the first-party PWA is **spine reach, not a perimeter channel.** It authenticates as the user and inserts to `capture_items` through the *same* authenticated path the web app uses — it is the spine on another screen, not a Hermes-class perimeter POST. It holds no tokens, opens no new write endpoint, and does NOT pre-empt or duplicate the Stage-3 Hermes capture channel (Hermes remains the untrusted-perimeter POST path; the PWA is the trusted first-party client). Contract line for the FR: "PWA introduces no write path beyond the existing authenticated `capture_items` insert" (already in FR-027 MUST). | C. | C. | C — canary is CI/server-side, never perimeter. |
| **NFR-001 low cost** | S — offline queue defers/avoids redundant calls; no new hosting (PWA is static assets on existing Vercel). | S — rule-based, zero AI calls in the ritual (the one recovery move reuses existing suggestion mechanics). | C — session config is free; no new infra. | **X (the cost trap)** — a naive canary that POSTs a real parse every tick reintroduces the exact OpenAI cost incident. *Resolution:* canary is **near-free by construction** — reads recent `ai_call_traces` outcomes (cheap DB read, already-recorded signal) and POSTs a synthetic parse **only on no-recent-signal or suspected transition**. Skip-if-no-secret keeps CI cost zero. Degrade-to-mock during an incident also *lowers* cost. |

**Every X above carries a resolution.** The four owner-flagged hot spots are resolved as: G1↔#368 → merge one packet set; G1 queue↔"raw survives AI failure" → strengthens it (row NS-INV/synergy: raw now also survives offline/device); G1 PWA↔Hermes perimeter → PWA is trusted spine reach, not a perimeter write path (no second write path); G2 auto-defer↔NS-INV-4 → bounded-rule reversible enumerated exception (not silent, not AI), recovery move stays L1; G3 session↔SECURITY_PRIVACY → secure-client-library session store, no hand-rolled tokens; G4 cost↔NFR-001 → trace-read-first, synthetic-POST-on-transition-only.

---

## 4. Sizing + recommended build order

Sizing (S/M/L per goal, rough PR-day feel — small floor, mostly integration):

| G | Packets | Size | Risk profile |
|---|---|---|---|
| G4 | F-G4a, F-G4b, F-G4c | **S–M** | Low. Reuses two existing workflows + existing status/fallback + existing traces table. Mostly CI-yaml + one script + one parse-lib guard. |
| G3 | F-G3a, F-G3b | **S** | Low–Med. G3a is a config change on one file (but auth-security → opus + careful test). G3b reuses the existing `provider==="mock"` signal — pure UI + one guard. |
| G2 | F-G2a, F-G2b, F-G2c | **M** | Med. Pure selectors + one deterministic write rule + one UI state. The NS-INV-4 reconciliation is the only judgment call (resolved above). |
| G1 | F-G1a, F-G1b, F-G1c | **M–L** | Highest. Offline queue correctness, IndexedDB durability, service-worker caching footguns, dedup, at-rest privacy, and the #368 merge. Genuinely new surface (SW/PWA). |

**Owner's tentative order: G4 → G3 → G2 → G1. Recommendation: KEEP IT, with two refinements.**

The order is correct — it is **ascending risk and ascending surface-novelty**, and it front-loads the incident-protection (G4) and trust-truth (G3) that make the *later, riskier* packets safe to ship (you want the canary and the loud-demo-banner live before you start moving capture data around offline). Corrections:

1. **Pull the docs-first FR adoption (F-G1c's REQUIREMENTS portion) to the very front, before G4.** AGENTS.md rule 13 / ADR 0002 D5: FR-027..030 + the DATA_MODEL §4.14 additions are the contract every packet builds against; they must land (human-gated, dated decision-log entry) before *any* code. This is not part of G1's build — it is the slice-0 of the whole floor.
2. **Sequence F-G2c (re-entry ritual UI) AFTER moments P3**, regardless of the G-order, so it lands as a moment state and never edits the hot `LifeOSCockpit`. If the floor must ship before moments P3, build F-G2c as a temporary LifeOSCockpit today-branch and accept it will be re-homed at P7 (flag this cost to the owner). **Preferred: interleave — G4, G3, G2a/G2b can all precede moments P3; G2c waits for P3.**

Refined order: **[Docs slice-0] → G4 (F-G4a‖F-G4c, then F-G4b) → G3 (F-G3a‖F-G3b) → G2 (F-G2a→F-G2b, F-G2c after moments P3) → G1 (F-G1a with #368 → F-G1b, privacy addendum with F-G1a).** (‖ = parallelizable.)

One dissent to surface, not override: if phone-capture is the owner's *actual daily blocker* (thoughts lost on the phone right now), G1 delivers the most adoption value and the owner may want it sooner. The counter-argument that keeps G1 last: G1 is the riskiest surface and benefits most from G3's loud-persistence-truth and G4's canary already being live (an offline capture that syncs into a silently-broken parse path, in a build with no persistence banner, is the worst-case trust failure). **Recommend keeping G1 last but timeboxing G4+G3 tightly so G1 is not far away.**

---

## 5. Risks / open questions (each with a recommended default)

| # | Risk / open question | Recommended default |
|---|---|---|
| R1 | **G1 IndexedDB raw captures are High-sensitivity at rest on a shared/lost phone.** | Queue holds raw text + `client_capture_id` only, never tokens/keys; **purge each entry on successful sync**; **clear the whole queue on logout**; document in SECURITY_PRIVACY addendum (F-G1c). Do not encrypt-at-rest in v1 (browser IndexedDB has no good key store; the mitigation is purge-on-sync + auth-gated app), but state this explicitly for owner sign-off. |
| R2 | **G1 service worker caching a stale app / becoming a second write path.** | SW caches the app shell + flushes the queue only; **all writes go through the normal authenticated `capture_items` path** (NS-INV-9). Versioned cache with skipWaiting; network-first for data. Never let the SW hold credentials. |
| R3 | **G2 threshold N and "fully lapsed" definition.** | N seed = 3 days, settings-configurable (FR-028). "Fully lapsed" = block `end_at` passed entirely during the absence window. Both deterministic, both test-pinned via clock injection. |
| R4 | **G2 auto-defer misread as an autonomy violation in review** (the NS-INV-4 trap). | The FR text + §3 resolution make it explicit: deterministic, reversible, enumerated, non-AI, recorded. Add a one-line rationale in the packet PR so a reviewer does not re-litigate. If the owner prefers zero exceptions, fallback = **propose-defer-with-one-tap-accept-all** (a single L1 batch approval) — costs one tap, removes the exception entirely. Recommend the bounded-rule version; name the one-tap-batch as the conservative alternative. |
| R5 | **G3 session-longevity mechanism: `persistSession` localStorage vs `@supabase/ssr` cookies.** | Prefer `@supabase/ssr` cookie-based sessions + a Next middleware refresh (survives SSR, matches "secure client library," works with the App Router). If that is too large for the floor, minimal fallback = set `persistSession:true, autoRefreshToken:true` on the existing browser client (smaller, localStorage-based). Recommend the SSR path; note it is the larger of the two. VERCEL_PRODUCTION_CHECKLIST §1 confirms the required session env is `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` (already present) and that missing config *degrades to Demo mode, not a build failure* — so G3a adds no new required env var, only session-persistence config on the existing client. |
| R6 | **G4 issue-spam / flapping provider.** | Raise an issue only on healthy→failing *transition*; dedup by checking for an existing open canary-labelled issue; auto-comment "recovered" (or close) on failing→healthy. Cron interval ~ every 30–60 min (cheap trace read); synthetic POST at most once per transition confirmation. |
| R7 | **G4 canary needs prod secrets in CI** (OpenAI key / prod URL). | Follow migration-drift: **skip-with-`::warning::` when the secret is absent** so forks/PRs stay green; the probe only does real work on the main-repo scheduled run with the secret present. Read-only trace access; synthetic parse uses `store:false`. |
| R8 | **Floor-vs-moments ordering churn** (F-G2c, F-G3b touch shell files moments also touches). | Stated in §2/§3: G2c after moments P3; G3b before P7 or trivially rebased. If the floor must fully precede moments, accept one re-home of G2c at P7 and flag it. No floor packet edits `LifeOSCockpit.tsx` directly. |
| R9 | **"~3s what-now" (FR-029) is unmeasured.** | Treat as a directional SHOULD backed by a warm-load smoke assertion, not a hard perf gate in the floor; if it fails, it becomes its own perf packet. Do not block the floor on a benchmark not yet instrumented. |
| R10 | **Open: does the floor get its own epic/tracking issue or interleave into Stage 1's #251?** | Recommend a dedicated **daily-driver-floor tracking issue** (campaign file: frozen criteria, slice list, decision log) since it is owner-ratified as a distinct pre-behavioral phase, cross-referencing #251 and #368. Confirm with owner. |

---

## Executive summary (10 lines)

1. **Scope shape:** the floor is config + small spine-layer guards + one new component family (PWA/queue) + one CI workflow — integration, not greenfield; every locus already exists in the repo.
2. **FRs drafted** in exact FR-022..026 house format: **FR-027** capture ubiquity (PWA + share-target + offline raw queue), **FR-028** re-entry amnesty, **FR-029** persistence truth + session longevity, **FR-030** provider canary + mock-first degrade. Task-map FR renumbers to **FR-031**.
3. **G1↔#368 is the same surface** — resolved by *merging* into one packet set: FR-026 owns the online-awaiting-parse containment path, FR-027 owns the raw-save/offline path; `return_hook` and `client_capture_id` land on `capture_items` together.
4. **G3 has a real, located bug:** `supabase/browser.ts` calls bare `createClient` with no session options — that is why sessions die; the fix is secure-client-library session config (recommend `@supabase/ssr`).
5. **G3(a) reuses the existing `provider==="mock"` signal** (workflow.ts/health.ts, H2 work) to make demo mode loud — no new signal invented; it is UX-INV-6 applied to persistence.
6. **G4's cheap probe would be blind** to a runtime 429 if it only checked env status; resolved by reading the existing `ai_call_traces` (latency/status already recorded) and POSTing a synthetic parse only on transition/no-signal — near-free per NFR-001; reuses migration-drift + pipeline-advance workflow patterns.
7. **G2 auto-defer vs NS-INV-4** resolved explicitly as a bounded-rule exception: deterministic, reversible, enumerated in the "while you were out" summary, non-AI, `re_entry.v1`-recorded — not a silent write; the single recovery move stays a full L1 proposal. Conservative fallback = one-tap-batch approval.
8. **Harmony matrix** covers G1–G4 × {S3–S9, C1–C5, moments P0–P7, task-map, NS-INV-1..9, UX-INV-1..6, perimeter, NFR-001}; every CONFLICT carries a resolution. Floor packets are **P7-flip-invariant** because they live below the UI shell (spine/data layer moments leaves untouched).
9. **Build order:** keep owner's **G4→G3→G2→G1** (ascending risk); two refinements — pull FR/DATA_MODEL adoption to a docs slice-0 first, and sequence the re-entry ritual UI (F-G2c) after moments P3 so it never edits the hot `LifeOSCockpit`.
10. **Top risks:** at-rest raw captures on phone (purge-on-sync + clear-on-logout), SW stale-cache/second-write-path (NS-INV-9), and floor↔moments shell-file ordering — all with recommended defaults in §5.

