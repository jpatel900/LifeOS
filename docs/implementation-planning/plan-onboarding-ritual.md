STATUS: DESIGN NOTE for epic #555 item 7 — content delegated to Claude by the owner 2026-07-14 ("onboarding: use your judgment"); owner reviews the BUILT result at the experience gate. Implementation may start once this merges and items 1-3 remain landed.

# Onboarding ritual — three steps to a first win

Binding sources: audit `docs/design/ux-audit-2026-07-13-codex.md` (P1 "first-use experience is not product-ready", Onboarding 2/10: login routes to a settings page; the required under-five-minute setup is absent). Not a tooltip tour — a setup that creates immediate value.

## Principle

The ritual ends with the user having CAPTURED SOMETHING and seeing it
truthfully reflected on their home — the product's core loop proven in the
first five minutes, not described.

## The three steps (one screen each, calm, skippable never blocking)

1. **Your areas.** Prefilled defaults (Main Job, Personal, Side Project) as
   editable chips — rename, delete, add, pick a color. One sentence of why
   ("Everything in LifeOS lives in an area."). Continue = areas persisted.
2. **Your day.** Work window (start/end, prefilled 9–17) + preferred focus
   session length (25/45/60 chips, prefilled 45). These feed the existing
   focus-budget and scheduling defaults. One sentence: "This shapes how much
   LifeOS suggests per day." Google Calendar connect appears as a quiet
   OPTIONAL link-out (existing approval-gated flow), never a gate.
3. **First capture.** The shared CaptureCore (FR-026 semantics, real parse or
   mock fallback) with the prompt "What's on your mind right now?". On
   resolve, the ritual closes onto the moments home where the hero line and
   triage badge now truthfully show the captured thought — the #551/#563
   state-truth surfaces ARE the payoff moment.

## Mechanics

- Trigger: first authenticated session with zero areas AND zero captures
  (deterministic, no flag needed); re-entry never shows it again. A
  "run setup again" affordance lives in Settings.
- Skippable per step (skip = keep defaults); the whole ritual is ≤5 minutes
  and usually ≤2.
- Login page copy loses "Local Supabase Login"/test-credential framing in the
  same slice (audit finding); dev prefill stays behind the existing dev-only
  guard.
- No new tables: areas/preferences/captures all have existing persistence.
  If a preference field is missing a home, STOP and surface (schema red zone).

## Oracle

- Component tests: trigger predicate (zero-state only), per-step skip
  defaults, capture step uses CaptureCore containment.
- e2e: fresh demo context → ritual appears → complete all three steps →
  home shows the captured thought in hero + badge; second visit → no ritual.
- Experience gate: drive it at 1280 + 390, judge the feel (calm, fast,
  no dead ends), screenshots reviewed.

## Effort

M. Touches: new onboarding component tree, login page copy, Settings
affordance, WorkflowContext read paths (trigger predicate — read-only).
File-disjoint from the planning-model slice except TodayMoments mounting;
serialize behind #573/#574 chain.
