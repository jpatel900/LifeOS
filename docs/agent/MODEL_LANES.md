# MODEL_LANES.md — roles and the one model mapping

Every other doc in this repo names ROLES, never models. This is the only file that maps roles to concrete models, so a model-generation change touches exactly one file. The mapping is volatile by nature — trust the date, not the habit.

## Roles (stable)

| Role            | What it does                                                              | Evidence bar                                                                   |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Driver**      | Plans, contracts, sequences lanes, merges per AGENTS.md merge authority   | Verifies against repo state (`origin/main`), never against a lane's own report |
| **Implementer** | Builds one contracted, bounded slice                                      | Red-first tests; evidence per AGENTS.md rule 11; never grades its own work     |
| **Verifier**    | Independently validates a slice (tests, drives, RLS, browser proof)       | Runs at the strongest tier the claim needs (running build > file reads)        |
| **Judge**       | Fresh-eyes scoring against ratified criteria (campaign re-scores, audits) | Did not implement what it scores; scores at the running-build tier             |

## Current mapping (as of 2026-08-04 — update the date when you change a row)

| Role        | Current choice                                                                            |
| ----------- | ----------------------------------------------------------------------------------------- |
| Driver      | Strongest available frontier model, one per session                                       |
| Implementer | Any capable current-generation model with a written contract; cross-vendor lanes are fine |
| Verifier    | Same tier as implementer or stronger; never the same agent instance that implemented      |
| Judge       | Strongest available frontier model, fresh context                                         |

Principles that outlive any mapping: separate the grader from the doer; give weaker-than-driver models tighter contracts, not more supervision text; when a model generation changes, re-test assumptions (a restriction written for last year's models is a candidate for deletion, not inheritance). Product AI model tiers (`AI_MODEL_STANDARD`/`AI_MODEL_CHEAP`/`AI_MODEL_STRONG`) are a separate axis — see `lifeos-schema-ai`.
