# Historical plan — Campaign C2: Structure (Final UX Loop)

**STATUS: HISTORICAL.** This records the original C2 port scope and brief conventions, not an execution queue. Current slice states and merged references live in [the campaign registry](campaigns.json). Current priorities, resume conditions and acceptance live in [the program](final-ux-loop.md) §§3–5.

The owner decision of 2026-09-29 retired further C2 re-scoring and the automatic campaign queue. The program governs the five-minute owner glance and any trial finding that warrants more implementation. This historical plan does not declare campaign closure or authorize another build round.

Owner-ratified decisions binding: **port ALL FOUR legacy screens** (Plan/calendar, Review, Health, All-areas) into the moments design language, preserving every legacy-only capability (hour-rail placement, unplan, proposal accept/reject/nudge, Google approval flow, planned-vs-actual, policy proposals); **require sign-in** on /settings/areas. Criteria (ratified): one shell (no old-design screen renders, route-level guard); every state change URL-visible, Back/Forward steps moments only; any screen ≤2 interactions from home; refresh/direct-URL/back agree.

## Original slice scope (historical, sequential port lanes)

- **S0 — Door** (small): /settings/areas signed-out → redirect to sign-in door with calm note; guard test. Independent, no port dependency.
- **S1 — Capability inventory** (read-only, parallel-safe): drive all four legacy screens signed-in; produce the authoritative capability checklist per screen (every control, every write path, every count), verified against DB writes — the port lanes' premise document. Includes the judge's flagged count contradiction (/calendar "0 Today" vs Start's "1 block"). Deliverable: docs comment on the C2 tracking issue (#687).
- **S2 — Port Plan/calendar** (largest: hour rail, placement/unplan, proposal accept/reject/nudge, Google approval, planned-vs-actual). Rides existing moments sheet conventions + #778 placement rails.
- **S3 — Port Review** (policy proposals, review history; close-verdict already lives in moments).
- **S4 — Port Health** (honest probes from #758 carry over; moments framing).
- **S5 — Port All-areas** (fix the #691 first-area scoping gap as part of the port — porting a wrong screen truthfully means fixing its lie).
- **S6 — Shell close-out**: remove legacy routes behind the rollback flag per #687 conventions, route-level one-shell guard, URL/Back-Forward criteria pins, legacy e2e migration (the gated cockpit specs get re-anchored or retired with guards).

The registry also records the later repair slices. Use it for delivered work and the program for the current owner acceptance gate; these original scope notes are not live status.

Rules unchanged: lane playbook contract per slice, red-first, truth-map for all copy, migrations human-review, capability survival proven by content not lineage, signed-in tier pins where the criterion is account-shaped.

## Slice-brief conventions (from the S2 brief, kept as the pattern for S3-S5)

Each port slice writes a short delivery brief before implementation covering:

- **Objective + intended feeling** — what the ported surface must let the user do and how it should feel, in plain words.
- **Invariant table** — every guarantee the legacy screen carried and the exact mechanism that preserves it (reuse the existing write paths — e.g. placement goes through the same durable-journal action the legacy screen called; the Google approval bridge is mounted, never reimplemented).
- **Copy truth-map** — every legacy string, whether it was true, the ported string, and why. Untrue legacy copy is fixed in the port, not carried over.
- **States covered** — loading/empty/partial/error/success/keyboard/touch/mobile/motion.
- **Explicitly out of scope** — named, with where each deferred piece lands (e.g. planned-vs-actual belongs to the Review port).
