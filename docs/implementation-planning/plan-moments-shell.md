STATUS: COMPLETE — shipped as of 2026-07-08; kept for reference.

# Implementation Plan — Structural Moments Pass (Today home: Start / Flow / Close)

Status: Planning artifact (read-only). Ratified by ADR 0003. Sequenced AFTER data slices S0–S4, BEFORE UI slices S5–S9.
Owner: jpatel900. Author: UX/Shell Architect.
Precondition met: epic #325 CLOSED (ADR 0003 D5 gate). S0/S1 merged; S2–S4 in flight; S5–S9 must be built into THIS shell, never the seven-stage shell.

Binding contracts respected verbatim: **UX-INV-1..6** (ADR 0003), NFR-005 (six primary screens, Home is a read-only routing surface), UX_FLOWS §2 anti-patterns, no new backend surfaces, Playwright E2E green through every packet.

---

## 0. Grounding: what already exists (do not rebuild)

Verified against `origin/main`:

- **Theme system already present.** `ThemeProvider` in `AppShell.tsx` defaults to `dark`, `enableSystem={false}`. The cockpit additionally carries its OWN scoped token set in `globals.css` under `.lifeos-cockpit` (dark default) + `.lifeos-cockpit[data-theme="light"]` (light variant), toggled by local `dark` state in `LifeOSCockpit.tsx` (persisted to `localStorage["lifeos.cockpit.preferences"]`). **The light/dark switcher already works** (`Toggle theme` button, `data-theme="light"` asserted by E2E). Owner "dark default + light/dark switcher" is DONE at the shell level — the moments pass inherits it.
- **Area tinting already present.** `--area-accent*` custom-property family in `globals.css`; JS-derived `--acc/--acc2/--acc-sf/--acc-rng/--on-acc` via `buildCockpitAccentStyle(activeArea.color, dark)` set inline on the `.lifeos-cockpit` root. Area color already tints the whole surface.
- **State colors already present.** `.lifeos-cockpit` defines `--amb-*/--blu-*/--grn-*` triplets; `focus-state-card[data-focus-state=...]` already maps running/paused/completed/stopped/stuck/distracted/missed to accent/primary/destructive.
- **Reduced-motion already present.** `@media (prefers-reduced-motion: reduce)` block at the end of `globals.css` disables `workflow-rise-in`, sheen, soft-pulse, and transitions.
- **Countdown timer already present.** `LifeOSCockpit` runs a `remaining/total` interval (Execute stage). Prototype extends this pattern to the schedule list.
- **Single component, single state owner.** `LifeOSCockpit.tsx` (~1600 lines) holds ALL stage rendering + all interaction state; `CockpitRoute stage="..."` is the only entry; `WorkflowContext` is the data spine (reducer with `acceptDraft/planTaskAtHour/startSession/markSession/saveReview/...`). This is a **hot file** — MEMORY + ADR D5 mandate one change at a time to it.

Implication: the moments pass is **≈70% new files + a controlled set of surgical edits to two hot files** (`LifeOSCockpit.tsx`, `AppShell.tsx`), not a rewrite. The prototype's taste (calm surfaces, countdown-as-budget, C-to-capture, one primary action) is the interaction contract; its code is throwaway per ADR D5.

---

## 1. Target shell architecture

### 1.1 Route structure

`/` (Today) becomes the single home hosting three **moments** (Start / Flow / Close) as in-page views switched by tab or keys `1/2/3` — NOT routes. The seven stages **keep their routes as demoted deep-link/fallback surfaces** (ADR: "the seven-stage router stays alive underneath until moments reach journey parity"). This is what keeps the old E2E specs green until the intentional flip.

| Route | Today (pre-flip) | Target (post-flip) | Demoted role |
|---|---|---|---|
| `/` | `CockpitRoute stage="today"` → stage grid | **`TodayMoments`** (Start/Flow/Close) | Home. Moments live here. |
| `/capture` | Capture stage view | Redirect/host → opens **CaptureOverlay** over Today | Overlay (UX-INV-2, `C`). Route kept as deep-link that auto-opens overlay. |
| `/triage` | Triage stage view | **TriageSheet** slide-over from Start | Sheet. Route deep-links the sheet open. |
| `/calendar` (plan) | Plan stage view | **PlanSheet / hour-rail** inline in Start | Sheet/inline. |
| `/execute` | Execute stage view | **Flow moment** (the current-block hero IS execute) | Moment. Route deep-links Flow. |
| `/review` | Review stage view | **Close moment** + demoted Review detail | Moment + detail. |
| `/health` | Health stage view | **Health truth surface**, reachable from Today masthead | Truth surface (kept, ADR: "Health remains a truth surface reachable from Today"). |
| `/areas` (overview) | Overview stage | **Scope switch** (existing area switcher in masthead) | Today-level scope, not a destination. |
| `/settings/*` | AdminShell | unchanged | Admin. |

Every demoted surface is **≤2 interactions from Today** (UX-INV-5): open sheet/overlay = 1 interaction; act = 2. Each keeps its route as a fallback (mouse-free deep-link + resilience if a moment view regresses).

### 1.2 Layout components (new files unless noted)

```
apps/web/src/app/components/moments/
  TodayMoments.tsx          -- container: moment state (start|flow|close), keyboard host, renders masthead + moment + CaptureAffordance + Toast
  MomentSwitcher.tsx        -- the 1/2/3 tab pill (Start/Flow/Close), color-carries-state
  StartMoment.tsx           -- Start view: FirstMoveCard + ScheduleList + SideRail(brief)
  FlowMoment.tsx            -- Flow view: CurrentBlockHero + DriftRecoveryCard + ParkedList + progression rail
  CloseMoment.tsx           -- Close view: DayCloseSummary + CarryForwardList + tomorrow-first-move
  FirstMoveCard.tsx         -- the single primary CTA (UX-INV-1)
  ScheduleList.tsx          -- countdown-rendered schedule (UX-INV-4)
  ScheduleBlock.tsx         -- one block row (now/done/free/countdown)
  CurrentBlockHero.tsx      -- Flow hero: countdown ring/clock toggle + done/pause/extend
  DriftRecoveryCard.tsx     -- plain-language recovery (replaces "guardrail"; UX-INV-3)
  DayCloseSummary.tsx       -- stats + carry-forward
  SideRail.tsx              -- waiting-on + area-health dots (color-carries-state)
  AreaHealthDots.tsx        -- per-area status dot (ok/watch/risk/idle)
  PipelineOverview.tsx      -- counts-per-workflow-step strip + drill-in (owner feedback)
  ProgressionRail.tsx       -- v0 task progression: game-style nodes, collapsed-to-next, dashed speculative
  CaptureAffordance.tsx     -- fixed capture bar + kbd hint
  CaptureOverlay.tsx        -- ⌘/Ctrl-K-independent capture modal (C), kind chips, ↵ save / esc close
  CommandPalette.tsx        -- ⌘/Ctrl-K palette: every action (ADR D2)
  CountdownClockToggle.tsx  -- shared countdown|clock switch (owner feedback; UX-INV-4 default = countdown)
  useCountdown.ts           -- hook: remaining-time formatting, warn threshold
  useMomentKeyboard.ts      -- hook: 1/2/3, C, ⌘K, ↵-primary, esc; respects input focus
  momentsViewModel.ts       -- pure selectors mapping WorkflowContext state -> moment props (NO new fetches)
```

`LifeOSCockpit.tsx` stays as the fallback stage renderer behind the demoted routes; only surgically edited at the flip.

### 1.3 Keyboard system (`useMomentKeyboard.ts`) — binding

Encodes the prototype's `keydown` handler + ADR D2 palette. When an input/textarea/overlay is focused, only `esc`/`↵` are intercepted; otherwise:

| Key | Action | Invariant discharged |
|---|---|---|
| `C` | open CaptureOverlay from anywhere, no context loss | **UX-INV-2** (capture ≤1 keystroke) |
| `⌘/Ctrl-K` | open CommandPalette (every action) | ADR D2 (palette, mouse-free) |
| `1 / 2 / 3` | switch Start / Flow / Close | UX-INV-5 |
| `↵` | invoke the visible moment's single primary action | **UX-INV-1** |
| `esc` | close top overlay/sheet | no dead end |

All primary flows completable mouse-free (ADR D2). Modifier combos other than ⌘K pass through.

### 1.4 Theme system — extend, do not replace

Dark default, light/dark switcher, area tinting, reduced-motion **already exist** (§0). The pass:
- Keeps `ThemeProvider defaultTheme="dark"` and the local `data-theme` toggle exactly as-is (E2E asserts both — do not touch).
- Adds the small NEW token set in §5 for color-carries-state (`--state-*`), motion durations (`--motion-*`), and countdown-warn.
- All new components consume `--area-accent*` / `--acc*` so area tinting flows automatically.
- Every new animation is gated by the existing `prefers-reduced-motion` block (add new selectors to it).

### 1.5 State needs

No new backend; all state is client-side, sourced from `WorkflowContext` + local UI state:
- **Moment state**: `moment: "start"|"flow"|"close"` (default derived from time-of-day; persisted to the existing `lifeos.cockpit.preferences` blob alongside `dark`,`areaId`,`stage`).
- **Overlay/sheet state**: `captureOpen`, `paletteOpen`, `activeSheet: null|"triage"|"plan"|"health"` — local to `TodayMoments`.
- **Countdown/clock toggle**: `timeDisplay: "countdown"|"clock"` (default `countdown` per UX-INV-4; persisted).
- **Focus session**: reuse the existing `activeTaskId/running/remaining/total` machinery (lift from `LifeOSCockpit` into a `useFocusSession` hook shared by Flow — pure refactor, behavior identical, so E2E stays green).
- **Progression rail**: derived read-only from task/subtask/draft-split shapes already in `WorkflowContext` (see §6 risk R5).

---

## 2. Component inventory (per-component contracts)

Contracts are complete enough for a Sonnet-class implementer to build without design judgment. Colors via tokens only. Each names the prototype interaction it encodes.

### FirstMoveCard  (encodes proto `.firstmove`)
- **Props**: `{ move: { title: string; why: string; areaLabel: string; estMinutes: number; followOn?: string }; onStart(): void; onSnooze(): void; onSwap(): void }`
- **Render**: area-accent left bar (`inset 4px 0 0 var(--acc)`); eyebrow tag "First move · {estMinutes} min" + area label; title; why (≤46ch); actions row.
- **Primary action**: `Start now` = `btn-primary` with `↵` kbd hint — the ONE visually primary action (**UX-INV-1**). `Snooze 10m` + `Not this →` are `btn-ghost` (subordinate). Trailing follow-on hint muted.
- **Behavior**: `onStart` → switch to Flow + start focus session + toast. Snooze/Swap fire callbacks + toast; never dead-end (UX-INV-3).

### ScheduleList / ScheduleBlock  (encodes proto `.sched` / `.block`)
- **ScheduleList props**: `{ blocks: ScheduleBlockVM[]; timeDisplay: "countdown"|"clock" }`
- **ScheduleBlockVM**: `{ id; title; meta; state: "done"|"now"|"upcoming"|"free"; startAt: string; endAt?: string; remainingLabel?: string }`
- **Render**: rows; `state="now"` gets accent gradient + pulsing dot + "left" pill; `done` strikethrough+muted; `free` green pill.
- **UX-INV-4**: time column shows **countdown** ("in 3h 28m", "2h 58m left") by default; `timeDisplay="clock"` shows wall time. Driven by `useCountdown`, ticking each second (reuses existing interval pattern). Warn color (`--state-warn`) below threshold.

### CountdownClockToggle  (owner feedback)
- **Props**: `{ value: "countdown"|"clock"; onChange(v): void }`
- Small segmented control; default `countdown` (UX-INV-4). Persisted. Used by ScheduleList and CurrentBlockHero.

### CurrentBlockHero  (encodes proto `.flowhero`)
- **Props**: `{ block: { title: string; areaLabel: string }; remaining: number; total: number; running: boolean; timeDisplay; onDone(): void; onPause(): void; onExtend(min: number): void; onToggleTime(): void }`
- **Render**: accent top-rule; tag "Current block · deep work"; big tabular countdown ring (`remaining` formatted); label "remaining — a budget, not a clock". Ring text switches to `--state-warn` under threshold.
- **Primary**: `Done — log it` (`btn-primary`, `↵`) = UX-INV-1. Pause / +25 min ghost.
- **Behavior**: wire to `useFocusSession` (`markSession`). Done → Close moment + toast. Reduced-motion: no pulse.

### DriftRecoveryCard  (encodes proto `.recover`; **REPLACES the "guardrail" concept** — owner-binding)
- **Props**: `{ drift: { minutes: number; reason?: string }; onReclaim(): void; onAbandon?(): void }`
- **Render**: amber-tinted card (`--state-warn` family), icon, plain-language headline ("You drifted for ~12 minutes."), reassuring body (no shame-language; UX_FLOWS principle 6), amber primary `Reclaim block`.
- **UX-INV-3**: Flow renders this whenever session state ∈ {stuck, missed, overrun, distracted}; a derailed Flow is NEVER a dead end. Do **not** use the word "guardrail" (prototype line 461 is stale — see §6 R6).

### SideRail  (encodes proto `.rail`: waiting-on + areas)
- **Props**: `{ waitingOn: WaitingVM[]; areas: AreaHealthVM[]; onOpenHealth(): void }`
- Two cards: **Waiting on** (avatar, who, what, days-late colored via `--state-*`) and **Areas** (AreaHealthDots). "Areas" opens Health surface (≤2 from Today).
- Waiting-on data = S4 output (aging). Pre-S4 → empty/degraded state (UX-INV-6 truthful).

### AreaHealthDots  (encodes proto `.health` / `.adot`; **color-carries-state**)
- **Props**: `{ areas: { id; name; status: "ok"|"watch"|"risk"|"idle"; note: string }[] }`
- Dot color = status via `--state-ok/watch/risk/idle`. At-a-glance semantics (owner feedback). `aria-label` includes textual status (color is never the only signal — accessibility).

### PipelineOverview  (owner feedback: counts-per-step + drill-in)
- **Props**: `{ counts: Record<Stage, number>; onDrill(stage): void }`
- **Render**: horizontal strip, one node per workflow step (capture/triage/plan/execute/review) showing `counts[stage]`, styled from the existing `vm.counts` + `PIPELINE_STAGES`. Reuses the current nav's count-badge visuals but demoted to an overview (not primary nav).
- **Behavior**: click a node → opens that step's sheet/route (drill-in). Lives in a Start disclosure or Health, NOT as primary chrome (NFR-005: no seventh nav item; UX_FLOWS §14 anti-pattern "full-screen analytics before basic use").

### ProgressionRail  (owner feedback: v0 game-style task nodes)
- **Props**: `{ nodes: ProgressionNode[]; onExpand(): void }` where `ProgressionNode = { id; label; status: "done"|"current"|"next"|"speculative"; kind: "real"|"speculative" }`
- **Render**: horizontal node chain. **Collapsed by default to the next node** (current + next visible, rest folded behind a "+N steps" affordance). `status="speculative"` (AI-guessed future breakdown) rendered with **dashed** borders + muted. Real completed nodes solid, accent-filled.
- **Behavior**: expand reveals full chain. **v0 is presentation-only** — nodes derive from task/subtask/draft-split data already in `WorkflowContext`; dashed speculative nodes are client-side placeholders; **no new fetch or write** (§6 R5). Hosts S9's sourced recalibration line inline on a node ("est 60m; your actuals run 1.4x") once S9 lands.

### CaptureAffordance + CaptureOverlay  (encodes proto `.capbar` / `.capture`; **UX-INV-2**)
- **CaptureAffordance props**: `{ onOpen(): void }` — fixed bottom-center pill + `C` kbd hint.
- **CaptureOverlay props**: `{ open: boolean; kinds: string[]; onSave(text, kind): void; onClose(): void }`
- **Behavior**: `C` from anywhere opens (no context loss); autofocus input; kind chips (Inbox/Task/Idea/Waiting-on); `↵` saves via `submitCaptureText` (existing), `esc` closes. Wire to `WorkflowContext.submitCaptureText`. Scrim blur; reduced-motion disables transition.

### CommandPalette  (ADR D2 — binding, absent from prototype)
- **Props**: `{ open; actions: PaletteAction[]; onRun(id): void; onClose(): void }`
- `⌘/Ctrl-K` opens; fuzzy-filter list of every action (switch moment, open capture, start/pause focus, plan, triage, open health, toggle theme, toggle time display, recolor area, switch area). Arrow-nav + `↵` run, `esc` close. Ensures full mouse-free operation.

### MomentSwitcher  (encodes proto `.moments`)
- **Props**: `{ value: "start"|"flow"|"close"; onChange(v): void }` — pill with 1/2/3 kbd chips; active tab uses ink/accent fill (color-carries-state).

### TodayMoments  (container)
- **Props**: `{ initialMoment?: Moment }`
- Owns moment + overlay + toggle state; mounts `useMomentKeyboard`; renders masthead (brand + area switcher + PipelineOverview entry + theme/time toggles), the active moment, CaptureAffordance, CaptureOverlay, CommandPalette, Toast. Consumes `useWorkflow()` + `momentsViewModel`.

### momentsViewModel.ts  (pure)
- `buildStartVM / buildFlowVM / buildCloseVM (state, selectedAreaId, dark, s5FocusBudget?) -> props`. Pure selectors, no fetches, no writes. This is where S5–S9 data gets mapped into moment props (§4).

---

## 3. Migration strategy — ordered PR-sized packets

**Core strategy — parallel build behind the live stage shell, single atomic flip.** The stage routes + `LifeOSCockpit` stay fully functional and their E2E specs stay UNTOUCHED through packets P1–P6. New moment code lands as NEW files with its OWN new specs added alongside. Only **P7 (the flip)** points `/` at moments, demotes the stages to fallback routes, and **rewrites the stage-chrome specs into moment-journey specs in that same packet** (ADR D5: "rewritten … in the same slice that changes the structure" — a contract update, not test weakening). CI is green before P7 (old specs pass, new specs pass) and green after P7 (moment specs pass, stage-fallback smoke passes).

**Hot-file rule**: `LifeOSCockpit.tsx` and `WorkflowContext.tsx` are touched by **at most one packet at a time**, and only P0/P7 touch `LifeOSCockpit.tsx`. File-touch sets below are disjoint except the deliberately-serialized hot files.

**Feature-flag option**: a build-time flag `NEXT_PUBLIC_MOMENTS_HOME` may gate P7's `/` swap so the flip is revertible by env without a code revert (recommended default — see §6 R1).

| Packet | Goal | File-touch set (new = N, edit = E) | Specs added/edited | Independently green? |
|---|---|---|---|---|
| **P0** Extract focus session | Lift `activeTaskId/running/remaining/total` + `startFocus/toggleFocus/finishSession` out of `LifeOSCockpit` into `useFocusSession.ts`; cockpit consumes it. Pure refactor, identical behavior. | N `moments/useFocusSession.ts`; **E `LifeOSCockpit.tsx`** (hot — solo) | none new; existing `cockpit-flow-repair`, `golden-journey` MUST stay green unchanged | Yes — behavior identical |
| **P1** Tokens + hooks | Add §5 tokens to `globals.css`; add `useCountdown`, `useMomentKeyboard`, `momentsViewModel` (pure, unit-tested). No UI wired. | N 3 hooks/vm; **E `globals.css`** (append only) | + unit tests for vm/hooks | Yes — additive, unreferenced |
| **P2** Primitives | FirstMoveCard, ScheduleList/Block, CountdownClockToggle, AreaHealthDots, SideRail, MomentSwitcher, CaptureOverlay, CaptureAffordance. Rendered only on a throwaway `/moments-preview` dev route (flag-gated, not linked). | N ~10 component files; N `app/moments-preview/page.tsx` (dev-only) | + component/RTL tests | Yes — isolated preview route |
| **P3** Moments assembled | StartMoment, FlowMoment, CloseMoment, TodayMoments, CommandPalette; wired to `WorkflowContext` + `useFocusSession`; still only on `/moments-preview`. | N 5 files | + moment-journey specs targeting `/moments-preview` (start→first-move, capture-during-flow, derail→recovery, close-day) | Yes — new specs green on preview route; old routes untouched |
| **P4** Drift recovery + progression rail | DriftRecoveryCard (replaces guardrail), ProgressionRail v0 (derived, presentation-only). | N 2 files; E `FlowMoment.tsx` | extend derail→recovery spec | Yes |
| **P5** Pipeline overview + demoted surfaces | PipelineOverview; TriageSheet/PlanSheet wrappers reusing existing stage bodies; Health-from-Today entry. | N sheet wrappers, PipelineOverview; reuse existing views | + sheet-open specs on preview | Yes |
| **P6** Deep-link fallbacks | Make `/capture /triage /calendar /execute /review /health /areas` continue to render (stage shell) AND, when moments home is enabled, auto-open the matching overlay/sheet on Today. Additive routing shim. | N `moments/deepLink.ts`; E route `page.tsx` files (thin) | + deep-link specs (preview) | Yes — old route render still passes |
| **P7** THE FLIP | Point `/` at `TodayMoments`; demote stage grid; rewrite `handoff-cockpit`/`cockpit-flow-repair`/`golden-journey`/`capture-parse-mock` stage-chrome assertions into moment-journey assertions in THIS packet; retire `/moments-preview`. Flag `NEXT_PUBLIC_MOMENTS_HOME` default-on. | E `app/page.tsx`; **E `LifeOSCockpit.tsx`** (hot — solo: demote grid to fallback); E the 4 stage specs; delete preview route | **edit** all four stage-chrome specs → moment-journey; keep stage-fallback smoke | Yes — green before (old specs) and after (moment specs) within the packet |

Disjointness check: only P0 and P7 edit `LifeOSCockpit.tsx` (serialized, never concurrent). No packet edits `WorkflowContext.tsx` (moments are read/selectors + existing actions only). `globals.css` edited only in P1 (append). All other files are new and packet-local.

**How E2E stays green through every packet**: P1–P6 add specs against the isolated `/moments-preview` route while the seven-stage specs run unchanged against live routes. The stage router never dies before parity (ADR). P7 is the only packet that rewrites stage specs, and it does so atomically with the structural change, so no commit ever has a red suite.

---

## 4. How S5–S9 slot into the shell (slot → host map; presentation-only)

The shell exposes **slots**; each slice fills its slot with its own (already-scoped) data/write work. The moments pass pulls **no** slice work forward.

| Slice | Data it produces | Host component (slot) | How rendered |
|---|---|---|---|
| **S5** Calendar-load-aware daily focus | focus budget (3/2/1) + top-N focus items | **FirstMoveCard** (the #1 move) + **ScheduleList** top-N in StartMoment | `buildStartVM` takes `s5FocusBudget`; over-budget items shown "deferred", not hidden. Degraded (no free/busy) → default budget + degraded copy. |
| **S6** Daily brief panel | synthesis: blocks, focus, aging, one stale project, recovery nudge | **StartMoment IS the brief host** — SideRail (waiting/aging) + ScheduleList (blocks) + DriftRecoveryCard (recovery nudge) + a stale-project line | Read-only aggregation via `momentsViewModel`; per-section empty/degraded states; **zero mutations** (network assertion) — the panel issues none by construction. |
| **S7** Wins & evidence log | confirmed `win_records` at weekly review | **CloseMoment** DayCloseSummary "wins" band + demoted **Review** detail surface | Close shows harvested wins read-back; the confirm/edit/skip harvest step lives in the Review detail sheet (S7 owns the write). |
| **S8** Rollup summaries | weekly→monthly `rollup_summaries` | **CloseMoment** / Review detail readback (this-week vs last, MoM) | Presentation of approved rollups; approval UI is the Review sheet (S8 owns write + context-source registration). |
| **S9** Learning-loop consumer | sourced duration recalibration + override-pattern policy-change card | **ProgressionRail** node inline ("est 60m; actuals 1.4x") + a policy-change card in the **Review** sheet | Recalibration numbers shown sourced (never unexplained); policy change is propose→approve in Review (S9 owns the decision-record write). |

Rule: the shell provides the slot and the read-model shape; the slice provides data + any write. No S5–S9 schema/write/prompt work is done in the moments pass.

---

## 5. Design tokens (extend `globals.css` — name only the NEW ones)

Dark-default, area tinting (`--area-accent*` / `--acc*`), reduced-motion, and the `--amb/--blu/--grn` state family **already exist** — reuse them. Add, in P1, mapped onto existing tokens (define in both `:root`/light and `.dark`, or scoped under `.lifeos-cockpit` to match the existing pattern):

```css
/* Color-carries-state — at-a-glance semantics (owner feedback; proto .adot) */
--state-ok:    var(--grn-fg);   /* moving / on-track      */
--state-watch: var(--amb-fg);   /* attention / pending    */
--state-risk:  var(--destructive); /* overdue / at-risk   */
--state-idle:  var(--fnt);      /* quiet / no signal      */
--state-warn:  var(--amb-fg);   /* countdown warn threshold */

/* Motion durations — keep instant-feeling per ADR D3 (<100ms perceived) */
--motion-fast: 90ms;    /* hover/press feedback           */
--motion-base: 160ms;   /* view/overlay transitions (matches existing 160ms) */
--motion-slow: 240ms;   /* moment rise-in (matches workflow-rise-in 280ms band) */
--motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1);

/* Countdown */
--countdown-warn-threshold: 10;  /* minutes; consumed by useCountdown, not CSS */
```

- All new components reference `--state-*` (never a raw hex) so light/dark + area tint flow automatically.
- Every new keyframe/transition must be added to the existing `@media (prefers-reduced-motion: reduce)` block (owner: "subtle motion as a requirement" — but reduced-motion still binding).
- Countdown-warn color = `--state-warn`; threshold is a JS constant fed to `useCountdown`.

---

## 6. Risks / open questions (each with recommended default)

**R1 — Flip mechanism: env flag vs hard route swap.** *Recommended default:* ship P7 behind `NEXT_PUBLIC_MOMENTS_HOME` (default-on at P7). Revertible by env without a code revert; lets the owner A/B the old stage home for one release. Retire the flag one release after parity is confirmed.

**R2 — Moment default selection.** Which moment `/` opens to. *Default:* time-of-day heuristic (Start before ~11:00, Flow during a live block, Close after ~17:00), overridable by last-used (persisted). Deterministic in tests via a clock injection.

**R3 — Health as truth surface: sheet vs full route.** ADR keeps Health reachable from Today. *Default:* keep the full `/health` route (E2E `Run system check` lives there) AND add a masthead entry that navigates to it. Do not reimplement Health as a sheet in this pass — lowest risk, keeps the health-truthfulness guard untouched.

**R4 — PipelineOverview placement.** Risk of re-introducing seven-stage chrome (NFR-005 / UX_FLOWS §14). *Default:* place it inside a Start disclosure ("Pipeline") + inside Health, NOT in the masthead. It is an overview with drill-in, explicitly not primary nav.

**R5 — ProgressionRail data source (no-new-backend tension).** Owner wants AI-breakdown game-nodes; constraint forbids new backend. *Default (state to owner):* v0 renders from data already in `WorkflowContext` (task, `splitDraft` subtasks, draft shapes). Dashed "speculative" nodes are **client-side placeholders** signalling "AI could break this down further" — no fetch, no write. A real AI-breakdown source is a **later data slice**, not this pass. Flag this so the owner knows v0's speculative nodes are illustrative until then.

**R6 — Prototype conflicts with binding inputs (follow binding input).** (a) Prototype line 461 labels the Flow card **"Guardrail"** — owner feedback is binding: use the plain-language **DriftRecoveryCard**; do not copy the label. (b) Prototype has **no command palette** — ADR D2 requires one; CommandPalette (⌘K) is in scope regardless of the prototype. *Default:* prototype is taste reference only; binding inputs win on both.

**R7 — Countdown/clock toggle scope.** *Default:* global (persisted) toggle affecting ScheduleList + CurrentBlockHero; default `countdown` (UX-INV-4). Clock mode is an accessibility/preference escape hatch, not the default.

**R8 — Sheet vs overlay for Triage/Plan.** *Default:* reuse the EXISTING stage view bodies (`TriageView`/`PlanView` from `LifeOSCockpit`) inside a slide-over sheet wrapper — do not rebuild them. Minimizes risk and keeps their internal behavior (and any coupled logic) intact; only the container chrome changes.

---

## UX-INV discharge check (each invariant → named contract)

- **UX-INV-1 (one primary action)** → FirstMoveCard/CurrentBlockHero/DayCloseSummary each expose exactly one `btn-primary`; all else `btn-ghost`. `↵` invokes it.
- **UX-INV-2 (capture ≤1 keystroke)** → `useMomentKeyboard` `C` → CaptureOverlay, no context loss.
- **UX-INV-3 (no dead ends)** → DriftRecoveryCard renders on every derailed Flow state; every card has a forward action.
- **UX-INV-4 (countdown time)** → ScheduleList/CurrentBlockHero default `timeDisplay="countdown"` via `useCountdown`; clock is opt-in.
- **UX-INV-5 (nav depth ≤2)** → every demoted surface opens as overlay/sheet (1) + act (2) from Today; MomentSwitcher keys `1/2/3`.
- **UX-INV-6 (truth-bearing surfaces live)** → all moment data flows from `WorkflowContext`/S4–S9 read-models; degraded/empty states are explicit; no static copy asserting state.
