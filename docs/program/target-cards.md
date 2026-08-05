# Target Cards — Final UX Loop, Phase 1 — **RATIFIED AS-IS BY OWNER 2026-07-26**

**STATUS: RATIFIED.** These cards define "done" for every campaign. A campaign closes only when a fresh-eyes re-drive scores AT/ABOVE target and every passed criterion ships a CI pin. Criteria are pass/fail on a running build, desktop + 390px mobile.

> Decisions ratified the same sitting: **Legacy screens: PORT ALL FOUR** (owner chose full coherence over the port-two recommendation — C2 scope grows accordingly; the four ports must preserve every legacy-only capability: hour-rail placement, unplan, proposal accept/reject/nudge, Google approval, planned-vs-actual, policy proposals). **Settings door: REQUIRE SIGN-IN** (signed-out /settings/areas redirects to the door with a calm note). Onboarding ritual content remains the one open OWNER-GATE (gates C3's close only).

Baseline: audit v2 (`docs/design/ux-audit-2026-07-26-fable.md`, PR #757). Overall experienced UX 4.2 → **5.0**.

## 1. Trust & state truth — 3.5 → **10** (non-negotiable; the doctrine dimension) — **CLOSED 2026-07-30 at 10/10**

- [x] Nothing the app claims about saving/completion is false anywhere: every "saved/completed/closed" phrase traces to a verified write (pin: guard tests per phrase — pattern shipped in #756).
- [x] A focus session ALWAYS produces exactly one truthful record: user-chosen outcome only, never a silent "partial", never nothing (pin: e2e).
- [x] Sorted/accepted work never resurrects as unsorted (capture status transitions pinned).
- [x] Close-the-day renders a verdict, exactly once per day, idempotent (pin: e2e + DB uniqueness).
- [x] Triage audit trail writes succeed for a signed-in user, and Health never says "everything is working" while its own probes fail (#758; pin: authenticated RLS test + Health honesty test).
- [x] Wins/reviews/rollups/plans/drafts all device-durable with tab-close survival (737-A S2-S5; pins per slice).

## 2. Information architecture — 5.0 → **9** — campaign C2, in flight

- [ ] One shell. Legacy cockpit routes ported per the owner decision (all four); no screen renders the old design (pin: route-level guard test).
- [ ] Every in-app state change is URL-visible; Back/Forward always steps moments, never jumps to another shell (pin: e2e history walk).
- [ ] Any screen reachable in ≤2 interactions from home; refresh/direct-URL/back always agree (pin: e2e matrix).

## 3. Capture — 7.0 → **9**

- [ ] Capture overlay controls look like controls (buttons have chrome/affordance) on both viewports (pin: visual/DOM assertions).
- [ ] Return hook never echoes placeholder text (pin: unit).
- [ ] Signed-out-but-online captures durable (pin: e2e).

## 4. Triage — 5.0 → **9**

- [ ] Sorting can never hang: parsing state has a timeout → the existing amber failure card renders; other rows never locked out (pin: unit + e2e with stalled mock).
- [ ] Status transitions on sort/accept persist (shared with Trust #3).
- [ ] One item = one truth: never simultaneously "unsorted" and an accepted task anywhere in the app.

## 5. Planning — 5.0 → **9**

- [ ] A task appears once per surface with ONE duration story (pin: e2e count assertions).
- [ ] Empty/filled copy never contradicts (pin: copy-pair guard).
- [ ] Placement survives reload and is visible where the user expects next (pin it).

## 6. Execute — 5.0 → **9**

- [ ] Navigation never ends a session; leaving shows a persistent "session running" affordance to return.
- [ ] End sheet outcome is the ONLY source of the recorded outcome.
- [ ] First tiny move shown at start (verify still true, pin).

## 7. Review/re-entry — 4.5 → **9**

- [ ] Closing the day yields an immediate, visible verdict/payoff.
- [ ] One close per day, further closes show the verdict instead of writing (idempotent).
- [ ] Wins/rollup payoffs render content, never blank states, at the moment of action.

## 8. Mobile — 6.5 → **9**

- [ ] Keep: 0 targets <44px, 0 overlaps (pin what passed: automated hit-test in CI).
- [ ] No desktop-only affordance text on mobile (pin: viewport-conditional copy test).
- [ ] Bottom-nav shell covers every ported surface (follows IA #1).

## 9. Accessibility — 7.5 → **9**

- [ ] Pin everything that passed (axe run in CI at AA on every surface, both viewports).
- [ ] Close the audit's residuals; zero new violations policy thereafter (ratchet: axe violation count pinned at 0).

## 10. Onboarding — 4.0 → **9**

- [ ] A brand-new account lands in the setup ritual on the FIRST screen after sign-in — no reload, no stale greeting (pin: e2e with fresh user).
- [ ] Ritual completes → first capture invited within 60 seconds of account creation, zero jargon on the path (pin: e2e timer + plain-language scan).
- [ ] OWNER-GATE: ritual content itself (three steps, what they create) — owner approves copy/flow before this campaign closes.

## 11. Emotional quality — 5.0 → **9**

- [ ] Every completion moment (sort, place, session end, close, win) renders its payoff immediately — no blank beats (depends on 1/7).
- [ ] Polish pass per surface against the premium bar (depth, rhythm, coherence) — entry-gated on campaigns C1-C5 closing; graded fresh-eyes.
- [ ] Zero contradictory copy pairs app-wide (guard extended to pairs).

## Campaign order (dependency, per program R6)

**C1 Trust** (cards 1, 4-partial, 6, 7-partial) → **C2 Structure** (card 2 + the ratified legacy/door decisions) → **C3 Onboarding** (card 10) → **C4 Flow completeness** (cards 3, 4, 5, 6 residuals) → **C5 Pins for mobile/a11y** (cards 8, 9 — cheap, can interleave) → **C6 Payoff & polish** (cards 7, 11).

## Open owner gates

1. Onboarding ritual content (three steps, what they create) — gates C3's close only. All other Phase-1 decisions were ratified 2026-07-26 and are recorded in the header above.
