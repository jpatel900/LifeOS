# Backlog Index — every planned thing, one scroll

STATUS: LIVE — owner-ratified 2026-08-05. This is a MAP, not an authority: each row points at the item's real home; the home governs. Rules: one line per item; update the row when the home changes (doc-truth fixes ride standing issue #820); rows may be deleted when shipped or rejected, never silently. Built from the 2026-08-05 ten-source inventory. The Final UX Loop (R8) freezes everything below except its own section — order inside sections is rough priority, not commitment.

## Now: the governing program (only unfrozen work)

| Item                                                                                                                                  | Status                     | Home                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C2 Structure: S2 re-land (truth-spec fix), S3 (#809), S4 Health port, S5 All-areas port (+#691 scoping), S6 shell close-out, re-score | in flight                  | [campaign-c2-structure.md](campaign-c2-structure.md)                                                                 |
| C3 First-run and onboarding (content DECIDED 2026-08-05: ratified plan)                                                               | queued                     | [final-ux-loop.md](final-ux-loop.md), [plan-onboarding-ritual](../implementation-planning/plan-onboarding-ritual.md) |
| C4 Flow completeness                                                                                                                  | queued                     | [final-ux-loop.md](final-ux-loop.md)                                                                                 |
| C5 Mobile + accessibility pins (AA in CI)                                                                                             | queued                     | [final-ux-loop.md](final-ux-loop.md)                                                                                 |
| C6 Payoff and polish (premium pass; route `impeccable` skill)                                                                         | queued                     | [final-ux-loop.md](final-ux-loop.md)                                                                                 |
| 29 unchecked target-card criteria (cards 2-11)                                                                                        | the concrete UX work above | [target-cards.md](target-cards.md)                                                                                   |
| Phase F key 1: full 11-dimension re-audit                                                                                             | after C2-C6                | [final-ux-loop.md](final-ux-loop.md)                                                                                 |
| Phase F key 2: owner U3 hour — PRECONDITION: refresh the scripted test plan first                                                     | owner-only                 | [final-ux-loop.md](final-ux-loop.md)                                                                                 |
| 737-A durability slices (freeze-exempt)                                                                                               | as needed                  | issue #737                                                                                                           |

## Contracted but unbuilt or partial (FRs exist; frozen behind Phase F)

| Item                                                                                                                                                            | Status                                                                                                                                         | Home                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| FR-012 missed-block recovery proposals                                                                                                                          | unbuilt                                                                                                                                        | docs/REQUIREMENTS.md; KNOWN_ISSUES row 1                                                   |
| Google Calendar update/reschedule (PATCH)                                                                                                                       | unbuilt                                                                                                                                        | KNOWN_ISSUES row 1                                                                         |
| FR-031 Task Map: v2 (cross-task `task_edges`, multi-task-per-capture) + 4 named v1 gaps (drawn edges, durations, triage-accept entry, first-tiny-step identity) | v1 shipped; #679 closed an evidence-triggered-revision slice (statuses disagree with the plan doc — dispose via #664); rest awaits disposition | [plan-task-map-contract](../implementation-planning/plan-task-map-contract.md); issue #664 |
| FR-032 Initiative Ladder: user-facing surface + demotion-on-dismissal-spike                                                                                     | kernel merged, no consumer                                                                                                                     | docs/REQUIREMENTS.md FR-032                                                                |
| FR-034 Sanctuary mark (column + UI toggle)                                                                                                                      | doctrine + predicate shipped; mark unbuilt                                                                                                     | docs/REQUIREMENTS.md FR-034                                                                |
| FR-035 Closure Ritual surface                                                                                                                                   | policy code exists, zero consumers, no issue                                                                                                   | docs/REQUIREMENTS.md FR-035                                                                |
| FR-037 Rupture minimal face (surface hiding)                                                                                                                    | kernel merged, no consumer                                                                                                                     | docs/REQUIREMENTS.md FR-037                                                                |
| FR-038 Portable Life Archive (one-command export; Hermes profile slice)                                                                                         | unbuilt beyond FR-016 export                                                                                                                   | docs/REQUIREMENTS.md FR-038; issue #643                                                    |
| FR-046 Telegram daily brief                                                                                                                                     | contract ratified; gated on FR-032 evidence + security review                                                                                  | docs/REQUIREMENTS.md FR-046                                                                |
| FR-047 Mirror: M3/M4 remainder (slice 1 shipped, #668 closed; owner answers now in the FR)                                                                      | partial                                                                                                                                        | docs/REQUIREMENTS.md FR-047                                                                |
| FR-048 Triggers: persistence/RLS/UI/firing (T2-T5; matching kernel shipped #669, zero consumers; owner answers now in the FR)                                   | partial                                                                                                                                        | docs/REQUIREMENTS.md FR-048                                                                |

## Reserved FRs (numbered, no contract yet)

| Item                                                                                                                                                                             | Home                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| FR-039 state-based task menus - FR-040 timer typology - FR-041 admin sprint - FR-042 habits - FR-043 executable goals - FR-044 research stop rule - FR-045 witnessed commitments | docs/REQUIREMENTS.md (2026-07-10 reservations block) |

## Vision candidates with written contracts (no FR yet)

| Item                                                                                                                                                                                                    | Home                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Trust kernel / `trust_ledger` (cited as a dependency by FR-047 but never contracted itself)                                                                                                             | [vision-execution-companion](../vision/vision-execution-companion.md) item 4 |
| Rehearsal (deterministic what-if) - Council view - Gardens - Deliberations (carries an unresolved options-table contradiction vs FR-024) - Seasons - Compost extensions                                 | companion §7/§7b; STAGE_BRIEFS Stage-2 list                                  |
| Auto-triage graduation - trust-repair ritual - charter renewal - continuity envelope - body-as-weather - money-as-commitments - inference ladder - profile-as-hypothesis - moments-x-map zoomable shell | companion §7/§7b; STAGE_BRIEFS axioms/stages                                 |
| Batch A docs-PR (16 doctrine paragraphs, zero-risk, pre-assembled)                                                                                                                                      | companion §7d/§8 — ready whenever the freeze allows                          |

## Vision items with exactly ONE home (rescued from invisibility by this index)

| Item                                                                                                 | Sole home                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Cadence stack (one ritual per time-altitude, fixed budgets)                                          | `vision-fable-horizon-pass` H4                |
| Meaning line / Future-Jay as user class                                                              | horizon-pass H6.1                             |
| Claims ledger (docs/CLAIMS.md gate before any public artifact)                                       | `vision-fable-wider-pass` W4                  |
| Voice-as-policy - delight budget - novelty-to-utility gauge - ten-year pre-mortem - lineage of minds | `vision-fable-deeper-pass` 1b/2b/1d/3c/Part 8 |
| Second dyad note - sibling harvest - operator-only boundary - RiseUp METHOD run (not a repo task)    | wider-pass W2/W3/W5                           |

## Stage contents with no FR and no issue (ADR 0002 D3)

| Item                                                                                                              | Home                                                            |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Stage 2: Notion one-way migration - knowledge-action links - "ask your cockpit" SQL - playbook detection          | docs/adr/0002-north-star-stages-and-trust-ladder.md; issue #292 |
| Stage 3: perimeter capture channels - consent-based meeting capture - staged external writes (INV-8 prerequisite) | same ADR; STAGE_BRIEFS Stage-3                                  |
| Stage 4: L3 graduations, action-class registry, shadow-mode rung (triage graduates first)                         | same ADR; STAGE_BRIEFS Stage-4                                  |
| Multi-agent runtime: issue open; drafted ADR was never committed (lives only in a superseded plans-folder file)   | issue #644; PLAN-644 (superseded)                               |

## Follow-ups from shipped work with no issue (from the 2026-07-23 parse §3)

F5 daily-offer-cap in localStorage - `duration_profiles` unplumbed - `UnsortedCaptures` untested - legacy e2e specs gated-not-migrated - `/` static-vs-dynamic - legacy `/triage` read-path gap - Flow-moment CutScopeCandidates - TriageView one-tap map. Home: BACKLOG-2026-07-23 (superseded) — this row is their only live registration; promote to issues one-by-one when the freeze allows.

## Open defects and doc-refresh queue

KNOWN_ISSUES rows 1 (calendar PATCH + FR-012), 2 (all-day conflicts unproven live), 4 (settings/areas line budget), 10 (deferred cockpit gaps), 15 (TEST_PLAN/UX_FLOWS moments refresh, queued behind C2-S6). Home: docs/KNOWN_ISSUES.md. Open feature issues: #664, #644, #643, #660, #483, #478, #555, #292, #293, #783, #737, #723, #717, #716, #715. Home: the board.

## Explicit non-goals (so nobody re-plans them)

The permanent-non-goals graveyard and the unapproved-capabilities constraint layer live in docs/REQUIREMENTS.md and govern regardless of anything above.
