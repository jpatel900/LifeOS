# PLAN — Campaign C2: Structure (Final UX Loop)

**STATUS: IN FLIGHT.** Card 2, IA 5.0 → 9. Live slice state is tracked in `docs/program/final-ux-loop.md` §6.

Owner-ratified decisions binding: **port ALL FOUR legacy screens** (Plan/calendar, Review, Health, All-areas) into the moments design language, preserving every legacy-only capability (hour-rail placement, unplan, proposal accept/reject/nudge, Google approval flow, planned-vs-actual, policy proposals); **require sign-in** on /settings/areas. Criteria (ratified): one shell (no old-design screen renders, route-level guard); every state change URL-visible, Back/Forward steps moments only; any screen ≤2 interactions from home; refresh/direct-URL/back agree.

## Slices (sequential lanes; re-score closes the campaign)

- **S0 — Door** (small): /settings/areas signed-out → redirect to sign-in door with calm note; guard test. Independent, decided, no port dependency. — **LANDED (#803)**
- **S1 — Capability inventory** (read-only, parallel-safe): drive all four legacy screens signed-in; produce the authoritative capability checklist per screen (every control, every write path, every count), verified against DB writes — the port lanes' premise document. Includes the judge's flagged count contradiction (/calendar "0 Today" vs Start's "1 block"). Deliverable: docs comment on the C2 tracking issue (#687). — **DONE**
- **S2 — Port Plan/calendar** (largest: hour rail, placement/unplan, proposal accept/reject/nudge, Google approval, planned-vs-actual). Rides existing moments sheet conventions + #778 placement rails. — **merged (#804), then its truth spec failed on main; main-red guard revert #806 armed; re-lands with the fix**
- **S3 — Port Review** (policy proposals, review history; close-verdict already lives in moments). — drafted (#809), waits behind the S2 re-land
- **S4 — Port Health** (honest probes from #758 carry over; moments framing).
- **S5 — Port All-areas** (fix the #691 first-area scoping gap as part of the port — porting a wrong screen truthfully means fixing its lie).
- **S6 — Shell close-out**: remove legacy routes behind the rollback flag per #687 conventions, route-level one-shell guard, URL/Back-Forward criteria pins, legacy e2e migration (the gated cockpit specs get re-anchored or retired with guards).
- **RE-SCORE** — fresh-eyes judge, full card 2, same protocol as C1 (rounds until targets, every pass pinned).

Rules unchanged: lane playbook contract per slice, red-first, truth-map for all copy, migrations human-review, capability survival proven by content not lineage, signed-in tier pins where the criterion is account-shaped.

## Slice-brief conventions (from the S2 brief, kept as the pattern for S3-S5)

Each port slice writes a short delivery brief before implementation covering:

- **Objective + intended feeling** — what the ported surface must let the user do and how it should feel, in plain words.
- **Invariant table** — every guarantee the legacy screen carried and the exact mechanism that preserves it (reuse the existing write paths — e.g. placement goes through the same durable-journal action the legacy screen called; the Google approval bridge is mounted, never reimplemented).
- **Copy truth-map** — every legacy string, whether it was true, the ported string, and why. Untrue legacy copy is fixed in the port, not carried over.
- **States covered** — loading/empty/partial/error/success/keyboard/touch/mobile/motion.
- **Explicitly out of scope** — named, with where each deferred piece lands (e.g. planned-vs-actual belongs to the Review port).
