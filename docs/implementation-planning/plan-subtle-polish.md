STATUS: COMPLETE — shipped as of 2026-07-08; kept for reference.

# Implementation Plan — Subtle Polish Pass (subconscious-quality details)

Status: Planning artifact (read-only contract source). Authored by Fable 2026-07-05 as the final judgment-tier plan before token exhaustion. Owner intent: "simple subtle things people don't notice but make a big difference subconsciously." Every packet below is contracted so a Sonnet-class implementer (or Codex) needs ZERO design judgment.

Doctrine anchor: these are not features. Each one removes a micro-erosion of trust — a jiggle, a lost keystroke, a stale number, a dead click. The user never names them; they just feel the system is solid. UX-INV-6 (truthful surfaces) and ADR D3 (<100ms perceived) are the parents of everything here.

Standing rules for every packet: Sonnet subagent, no delegation, checkpoint discipline (WORKPLAN outside repo), no hot files (`LifeOSCockpit.tsx`, `WorkflowContext.tsx`) ever, tokens only (no raw hex), full suite green, one packet = one PR. Packets are ordered by leverage-per-risk; SP-1..SP-5 are the core five. All touch moments files — SERIALIZE them (one at a time), they are NOT concurrent-safe with each other or with P7.

---

## SP-1 — Focus discipline (never lose the user's place)

**Why it matters subconsciously:** every overlay that swallows focus and dumps it at `<body>` forces a micro "where am I" reorientation. Users feel it as vague unease, never report it.

**Contract:**
- Every overlay/sheet (`CaptureOverlay`, `CommandPalette`, `MomentSheet`, ritual) on close returns focus to the element that opened it. Implement one shared hook `useReturnFocus()` in `components/moments/` (capture `document.activeElement` on open, `.focus()` it on close; guard element-removed).
- Focus is trapped inside open dialogs (Tab/Shift-Tab cycle within; ground on the existing dialog markup — add a small `useFocusTrap` or wire the roving behavior by hand; NO new dependency).
- Focus rings: keyboard-only visibility via `:focus-visible` (audit new moments components; replace any `:focus` ring styles; never remove rings entirely).
- Autofocus rules already present (capture input, palette input) stay.

**Files:** N `useReturnFocus.ts` (+test), E the four overlay/sheet components, additive tests (RTL: open overlay via keyboard, close, assert `document.activeElement` restored).
**Oracle:** RTL focus assertions per surface; axe/roles unchanged.

## SP-2 — Drift-free, honest clocks

**Why:** a countdown that stutters (ticks at 1.3s intervals), jumps after tab-switch, or shows a stale "2h left" after the laptop slept reads as *the system lies about time* — subconsciously fatal for a tool whose core metaphor is "countdown as budget" (UX-INV-4).

**Contract:**
- Replace naive `setInterval(1000)` ticking (in `useCountdown` and TodayMoments' interim session) with wall-clock-anchored ticking: compute remaining from a fixed anchor timestamp (`endAt` or `startedAt + total`) on every tick; schedule the next tick at the next real second boundary (`setTimeout(1000 - (Date.now() % 1000))`). Elapsed time is thus ALWAYS derived, never accumulated — sleep/throttle cannot corrupt it.
- On `visibilitychange` → visible: recompute immediately (no waiting up to 1s showing stale numbers).
- When tab hidden: stop scheduling ticks (battery + honesty; recompute on return).
- Testability: keep `now` injectable exactly as the view-model does; fake timers in tests.
- NOTE: this changes the interim focus session semantics from "decrement remaining" to "derive remaining from anchor" — pausing stores accumulated-paused-time. Contract the state shape: `{ anchorAt: number, pausedAccumMs: number, pausedAt: number | null }` derivation.

**Files:** E `useCountdown.ts`, E `TodayMoments.tsx` (interim session), tests updated additively (assert derivation across a simulated 2-minute clock jump).
**Oracle:** test simulating tab-hidden + clock jump shows correct remaining on return; no drift over 100 simulated ticks.

## SP-3 — Numeric steadiness (nothing jiggles)

**Why:** proportional digits make a ticking countdown wobble horizontally; a count badge appearing shifts a whole row. Users perceive jiggle as cheapness.

**Contract:**
- `font-variant-numeric: tabular-nums` on EVERY changing number: countdowns (hero, schedule rows), count badges (PipelineOverview, moment counts, SideRail days-late), ritual counts. Grep-audit all moments components for rendered numbers; apply a shared utility class (Tailwind `tabular-nums` exists — use it).
- Count badges reserve space: fixed `min-width` (2ch) so 9→10 doesn't shift siblings; badges for count 0 render as an empty reserved slot or a stable "0", never unmount (pick per component's truthfulness: pending-triage 0 shows "0" — truthful idle; never collapse).
- Toast: already `position: fixed` (no layout shift) — verify and add a regression test that toast mount does not change document height.

**Files:** E moments components (class-level edits only), additive tests (snapshot-free: assert class presence + a jsdom layout-invariance check where feasible).
**Oracle:** grep test in the PR (not CI) listing every `\d` render site audited; CI = existing suites green.

## SP-4 — Motion choreography (exits faster than entrances, one easing)

**Why:** UIs feel "considered" when things arrive gently and leave quickly; equal-duration exits feel sluggish. Nobody articulates this; everyone feels it.

**Contract:**
- All overlay/sheet/toast transitions use the P1 motion tokens ONLY (`--motion-fast/base/slow`, `--motion-ease`); grep for literal `ms` durations in moments components and replace.
- Exit durations = `--motion-fast` (90ms); enter = `--motion-base` (160ms). Apply to CaptureOverlay, CommandPalette, MomentSheet, toast, ritual mount.
- Every new transition/keyframe is inside the existing `prefers-reduced-motion` gating pattern (scoped utility classes; do NOT edit `globals.css` — if a needed class doesn't exist, use inline `style` with the CSS vars, the established fallback in these components).
- No spring/bounce anywhere (calm surfaces doctrine).

**Files:** E moments components (style-level), additive assertions where cheap.
**Oracle:** grep proves zero literal millisecond values in `components/moments/` outside token definitions; reduced-motion E2E still green.

## SP-5 — Never lose typed text (interruption safety)

**Why:** losing three words of a capture to a stray Esc teaches the hand not to trust the box. Silent, cumulative, deadly for a capture-first product (FR-026/FR-027 spirit, client-side complement).

**Contract:**
- `CaptureOverlay`: unsaved input survives close→reopen within the session. Lift the draft to a `useState` in TodayMoments (or sessionStorage key `lifeos.moments.captureDraft` — choose sessionStorage so it survives accidental route changes; clear ONLY on successful save). Esc closes the overlay but preserves the draft; reopening shows it with cursor at end; a small muted "draft restored" hint renders when non-empty on open.
- Same pattern for the CommandPalette query? NO — palettes should reset (convention). Only capture.
- The re-entry ritual must not clobber an open capture draft (ritual renders instead of moments, but sessionStorage draft persists — assert).

**Files:** E `CaptureOverlay.tsx` (accept optional `initialText`/`onDraftChange` or read storage directly — prefer props for purity, storage in TodayMoments), E `TodayMoments.tsx`, additive tests (type→esc→reopen→text present; save→reopen→empty).
**Oracle:** the RTL journey above; suite green.

## SP-6 — Undo over confirm (reversible-by-default actions)

**Why:** confirm dialogs tax every action to insure the rare mistake; undo taxes only the mistake. Systems with undo feel *safe to move fast in* — the deepest subconscious trust there is. All targeted transitions are already designed-reversible (backlog/unplan/carry are normal transitions).

**Contract:**
- Extend the toast slot in TodayMoments to `{ message, action?: { label: "Undo", run(): void } }`, 6s duration when an action is present (2.5s otherwise), still single-slot, still `aria-live="polite"`; Undo is a real button (focusable; NOT auto-focused).
- Wire undo for: ritual recovery-accept (undo = `applyTaskReviewTransition`-equivalent context action back to backlog — ground which existing context action reverses `promoteBacklogTask`; if none exists cleanly, drop this one and note it), carry-forward in CloseMoment (reverse via existing action if one exists), swap in the C1 refusal surface ONCE C1 lands (coordinate: this sub-item only after #404 merges).
- HARD BOUND: only wire undo where a real reversing context action already exists. NEVER add data-layer writes for undo in this packet; list the gaps found in the PR body as future data-layer candidates.

**Files:** E `TodayMoments.tsx` (toast shape), E call sites, additive tests (undo restores prior visible state).
**Oracle:** RTL: action → toast with Undo → click → state restored.

## SP-7 — One voice for time and counts (single formatter)

**Why:** "in 3h 28m" here, "3 hours" there, "205 min" elsewhere — each inconsistency is a micro-translation the reader performs. One formatter = zero translations.

**Contract:**
- N `components/moments/formatTime.ts`: `formatCountdown(ms)` ("2h 58m left", "48s left"), `formatRelative(iso, now)` ("in 3h 28m", "8 days ago"), `formatClock(iso)` (locale short time) — pure, `now`-injected, unit-tested including pluralization (1 day/2 days) and boundaries (59s→1m).
- Sweep `components/moments/**` + `lib/reEntry/summary.ts` consumers for hand-rolled time strings; route all through the formatter. Do NOT touch LifeOSCockpit's stage-shell strings (P7 rewrites those surfaces anyway).
- Pluralization helper `plural(n, "task")` used by every count copy in moments (grep-audit).

**Files:** N formatter (+test), E moments components, additive tests.
**Oracle:** grep proves no ad-hoc `"h "`/`"m left"` template literals remain in moments components; suite green.

## SP-8 — Empty states that orient (audit pass)

**Why:** an empty list that just says "Nothing here" is a dead end (UX-INV-3 in miniature). Every empty state should name the action that fills it — partially done (P3 Start empty state does this); finish the sweep.

**Contract:** audit every list/collection render in `components/moments/**` (ScheduleList empty day, SideRail empty waiting/areas, TriageSheet zero pending, CloseMoment zero carry-forward, ProgressionRail handled, palette zero matches). Each gets one calm sentence naming the filling action + the relevant kbd hint where applicable ("Press C to capture the first thing"). No new components; copy + tiny conditionals only. Table of before/after copy in the PR body.
**Oracle:** RTL assertions per empty state; banned-words check (no "nothing here", "empty", "no data").

## SP-9 — Touch parity + hit targets (pre-G1 floor)

**Why:** 32px buttons feel fine with a mouse and hostile to thumbs; G1 makes this a phone app. Fix before the PWA lands, not after.

**Contract:** every interactive element in moments components ≥44×44px effective hit area (padding, not size — visual design unchanged); hover-revealed affordances (if any grep-audit finds them) get always-visible-on-coarse-pointer via `@media (pointer: coarse)` or are made always-visible; `touch-action: manipulation` on tappable rows to kill the 300ms-double-tap ghost.
**Files:** E moments components (class edits), no logic.
**Oracle:** a unit test asserting the shared button/row classes include the hit-area utilities; visual check deferred to owner.

## SP-10 — Timestamps that stay true

**Why:** a "2m ago" that still says "2m ago" ten minutes later is a small lie the user catches eventually — and then re-checks everything else.

**Contract:** any RELATIVE time rendered outside the ticking countdown paths (ritual "N days away", SideRail "N days", stalest "ageDays") either (a) derives from the same `now` prop that TodayMoments already re-derives per render — verify each site actually re-renders when `now` changes and document the refresh cadence, or (b) if `now` is mount-frozen (it is: `useMemo(() => nowProp ?? new Date(), [nowProp])`), add a slow refresh: re-anchor `now` every 60s via the SP-2 anchored scheduler (single interval in TodayMoments, state-driven). Choose (b); it also fixes the moment heuristic going stale across hour boundaries.
**Files:** E `TodayMoments.tsx` (+test with fake timers: advance 61s → relative labels update).
**Oracle:** the fake-timer test.

---

## Sequencing & interleave

- SERIAL within this plan (all packets touch moments files): SP-2 → SP-3 → SP-5 → SP-1 → SP-7 → SP-4 → SP-8 → SP-10 → SP-9 → SP-6 (SP-6 last: partially gated on C1 #404).
- vs P7 (the flip): ALL SP packets are P7-safe (they live in components the flip re-hosts unchanged) but do NOT run any SP packet concurrently with P7. Preferred: SP-2/3/5 before P7 (they harden what the flip exposes to daily use), rest after.
- vs Codex lane: fully disjoint from C2–C4/CO packets (different files) — SP and C/CO waves CAN run concurrently.
- Each packet's PR body must cite this plan + packet id, list the audited sites, and declare "no hot files, no globals.css, tokens only".

## Explicitly rejected (so nobody re-litigates)

- Sound/haptics — Stage 3+, needs owner taste session.
- Skeleton screens — the app is local-state-fast; skeletons would add perceived slowness. Revisit only if a real >300ms async surface appears.
- Spring animations — violates calm-surfaces doctrine.
- Auto-advancing moments by clock while the user is active — creepy; the heuristic runs on open only (SP-10's 60s re-anchor must NOT switch moments automatically — pin with a test).
