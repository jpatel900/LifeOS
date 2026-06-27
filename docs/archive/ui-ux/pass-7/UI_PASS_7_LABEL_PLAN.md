# UI Pass 7 Label Plan

Status: Proposed metadata plan pending authenticated GitHub write access
Purpose: Define the Pass 7 label taxonomy, readiness-state policy, milestone strategy, and exact issue-to-label mapping
Read when: Applying `#201` or reviewing Pass 7 issue metadata
Do not use for: Runtime truth or shipped UX status
Superseded by: Authenticated GitHub labels, milestone metadata, and issue state once backfilled

## Strategy

- Reuse existing `area:*`, `risk:*`, and `agent:*` labels where they already match the requested semantics.
- Add only the missing Pass 7 labels needed to filter by phase, route, quality pass, and readiness.
- Do not create duplicate synonyms such as `ui` beside `area:ui` or `ready-for-codex` beside `agent:ready`.
- Open Pass 7 issues should carry exactly one risk label and at most one readiness label.
- Route issues may carry more than one surface label only when the issue truly spans multiple first-class surfaces.

## Requested label to canonical label mapping

| Requested meaning | Canonical label | Action |
| --- | --- | --- |
| `pass-7` | `pass-7` | create |
| `docs-hygiene` | `docs-hygiene` | create |
| `ui` | `area:ui` | reuse |
| `tests` | `area:tests` | reuse |
| `shell` | `surface:shell` | create |
| `capture` | `area:capture` | reuse |
| `home` | `surface:home` | create |
| `planning` | `surface:planning` | create |
| `calendar-safety` | `calendar:safety` | create |
| `triage` | `surface:triage` | create |
| `execute` | `surface:execute` | create |
| `review` | `surface:review` | create |
| `health` | `area:health` | reuse |
| `areas` | `surface:areas` | create |
| `visual-system` | `surface:visual-system` | create |
| `accessibility` | `quality:accessibility` | create |
| `performance` | `quality:performance` | create |
| `audit` | `quality:audit` | create |
| `blocked` | `blocked` | create |
| `ready-for-codex` | `agent:ready` | reuse |
| `needs-human-review` | `needs:human-review` | create |

## Existing labels to reuse unchanged

| Label | Why reuse it |
| --- | --- |
| `area:docs` | Already matches docs-only or docs-primary work |
| `area:tests` | Already matches test work |
| `area:ui` | Already matches cross-route UI work |
| `area:capture` | Already matches Capture work |
| `area:calendar` | Already matches Planning and calendar route work |
| `area:health` | Already matches Health work |
| `risk:low` | Existing risk taxonomy |
| `risk:medium` | Existing risk taxonomy |
| `risk:high` | Existing risk taxonomy |
| `agent:ready` | Existing readiness label for `ready-for-codex` |
| `needs:human-decision` | Keep for issues that truly need a human decision, not just a review |

## New labels to create

| Label | Color | Description |
| --- | --- | --- |
| `pass-7` | `0e8a16` | UI UX Pass 7 recovery backlog |
| `docs-hygiene` | `bfdadc` | Pass 7 documentation inventory, consolidation, and archival work |
| `surface:shell` | `5319e7` | Pass 7 AppShell, nav, or shared chrome work |
| `surface:home` | `0052cc` | Pass 7 Home route work |
| `surface:planning` | `fbca04` | Pass 7 Planning route work |
| `calendar:safety` | `b60205` | Planning work that touches approval or external calendar safety framing |
| `surface:triage` | `c5def5` | Pass 7 Triage route work |
| `surface:execute` | `f9d0c4` | Pass 7 Execute route work |
| `surface:review` | `fef2c0` | Pass 7 Review route work |
| `surface:areas` | `bfd4f2` | Pass 7 Areas route work |
| `surface:visual-system` | `d4c5f9` | Pass 7 visual-system cleanup after hierarchy work |
| `quality:accessibility` | `7057ff` | Pass 7 accessibility-focused work |
| `quality:performance` | `1d76db` | Pass 7 performance and perceived-speed work |
| `quality:audit` | `d93f0b` | Pass 7 audit, rubric, evidence, or closeout work |
| `blocked` | `b31d28` | Pass 7 issue is not ready because prerequisites are incomplete |
| `needs:human-review` | `6f42c1` | Pass 7 issue needs explicit human review before closeout |

## Milestone and project action

Create one milestone only:

- Milestone name: `UI UX Recovery Epic Pass 7`
- Scope: issues `#146` through `#202`
- Why: enough to group a strictly ordered backlog without adding a second control surface

Do not create a separate GitHub Project board unless the milestone plus labels proves insufficient. For this backlog, a milestone and filtered issue views are simpler and better.

## Readiness policy

- Parent epic `#146` should not carry a readiness label.
- Current actionable work gets `agent:ready` only when all dependencies in `docs/agent/UI_PASS_7_EXECUTION_MAP.md` are satisfied.
- Future work that cannot start yet gets `blocked`.
- Use `needs:human-review` for safety-sensitive or final-signoff issues that should not be closed on agent optimism alone.
- Reserve `needs:human-decision` for issues that truly require a product or scope decision rather than normal review.

## Issue application matrix

### Meta hardening and closeout control

| Issue | Labels |
| --- | --- |
| `#146` | `pass-7` |
| `#200` | `pass-7`, `area:docs`, `risk:medium` |
| `#201` | `pass-7`, `area:docs`, `risk:medium` |
| `#202` | `pass-7`, `area:docs`, `quality:audit`, `risk:medium` |
| `#198` | `pass-7`, `area:ui`, `quality:audit`, `risk:high`, `needs:human-review`, `blocked` |
| `#199` | `pass-7`, `area:docs`, `quality:audit`, `risk:high`, `needs:human-review`, `blocked` |

### Docs hygiene

| Issue | Labels |
| --- | --- |
| `#147` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |
| `#148` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:medium`, `blocked` |
| `#149` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |
| `#150` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |
| `#151` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |
| `#152` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |
| `#153` | `pass-7`, `area:docs`, `docs-hygiene`, `risk:low`, `blocked` |

### Roadmap and review setup

| Issue | Labels |
| --- | --- |
| `#154` | `pass-7`, `area:docs`, `risk:medium`, `blocked` |
| `#155` | `pass-7`, `area:docs`, `risk:medium`, `blocked` |
| `#156` | `pass-7`, `area:docs`, `risk:medium`, `blocked` |
| `#157` | `pass-7`, `area:docs`, `risk:low`, `blocked` |
| `#158` | `pass-7`, `area:docs`, `quality:audit`, `risk:medium`, `blocked` |

### Tests and shared UX rules

| Issue | Labels |
| --- | --- |
| `#159` | `pass-7`, `area:tests`, `risk:medium`, `blocked` |
| `#160` | `pass-7`, `area:tests`, `area:capture`, `surface:home`, `risk:medium`, `blocked` |
| `#161` | `pass-7`, `area:tests`, `risk:medium`, `blocked` |
| `#162` | `pass-7`, `area:tests`, `surface:shell`, `risk:medium`, `blocked` |
| `#163` | `pass-7`, `area:tests`, `area:capture`, `surface:home`, `risk:medium`, `blocked` |
| `#164` | `pass-7`, `area:docs`, `quality:audit`, `risk:low`, `blocked` |
| `#165` | `pass-7`, `area:docs`, `risk:medium`, `blocked` |
| `#166` | `pass-7`, `area:ui`, `risk:medium`, `blocked` |
| `#167` | `pass-7`, `area:ui`, `risk:medium`, `blocked` |
| `#168` | `pass-7`, `area:docs`, `area:tests`, `risk:medium`, `blocked` |

### Shell and navigation

| Issue | Labels |
| --- | --- |
| `#169` | `pass-7`, `area:ui`, `surface:shell`, `surface:areas`, `risk:medium`, `blocked` |
| `#170` | `pass-7`, `area:ui`, `surface:shell`, `risk:medium`, `blocked` |
| `#171` | `pass-7`, `area:ui`, `surface:shell`, `risk:medium`, `blocked` |
| `#172` | `pass-7`, `area:ui`, `surface:shell`, `surface:areas`, `risk:medium`, `blocked` |

### Capture

| Issue | Labels |
| --- | --- |
| `#173` | `pass-7`, `area:capture`, `area:ui`, `risk:medium`, `blocked` |
| `#174` | `pass-7`, `area:capture`, `area:ui`, `risk:medium`, `blocked` |
| `#175` | `pass-7`, `area:capture`, `area:ui`, `risk:medium`, `blocked` |
| `#176` | `pass-7`, `area:capture`, `area:ui`, `risk:medium`, `blocked` |
| `#177` | `pass-7`, `area:capture`, `area:tests`, `risk:high`, `blocked` |

### Home

| Issue | Labels |
| --- | --- |
| `#178` | `pass-7`, `area:ui`, `surface:home`, `risk:medium`, `blocked` |
| `#179` | `pass-7`, `area:ui`, `surface:home`, `risk:medium`, `blocked` |
| `#180` | `pass-7`, `area:ui`, `surface:home`, `risk:medium`, `blocked` |
| `#181` | `pass-7`, `area:tests`, `surface:home`, `risk:medium`, `blocked` |

### Workflow routes

| Issue | Labels |
| --- | --- |
| `#182` | `pass-7`, `area:ui`, `surface:triage`, `risk:medium`, `blocked` |
| `#183` | `pass-7`, `area:ui`, `surface:triage`, `risk:medium`, `blocked` |
| `#184` | `pass-7`, `area:calendar`, `surface:planning`, `risk:medium`, `blocked` |
| `#185` | `pass-7`, `area:calendar`, `surface:planning`, `calendar:safety`, `risk:high`, `needs:human-review`, `blocked` |
| `#186` | `pass-7`, `area:ui`, `surface:execute`, `risk:medium`, `blocked` |
| `#187` | `pass-7`, `area:ui`, `surface:review`, `risk:medium`, `blocked` |
| `#188` | `pass-7`, `area:health`, `area:ui`, `risk:medium`, `blocked` |
| `#189` | `pass-7`, `area:ui`, `surface:areas`, `risk:medium`, `blocked` |

### Final visual system

| Issue | Labels |
| --- | --- |
| `#190` | `pass-7`, `area:ui`, `surface:visual-system`, `risk:medium`, `blocked` |
| `#191` | `pass-7`, `area:ui`, `surface:visual-system`, `risk:medium`, `blocked` |
| `#192` | `pass-7`, `area:ui`, `surface:visual-system`, `risk:medium`, `blocked` |
| `#193` | `pass-7`, `area:ui`, `surface:visual-system`, `risk:medium`, `blocked` |

### Accessibility, motion, performance, evidence

| Issue | Labels |
| --- | --- |
| `#194` | `pass-7`, `area:ui`, `quality:accessibility`, `risk:medium`, `blocked` |
| `#195` | `pass-7`, `area:ui`, `risk:low`, `blocked` |
| `#196` | `pass-7`, `area:ui`, `quality:performance`, `risk:medium`, `blocked` |
| `#197` | `pass-7`, `area:docs`, `quality:audit`, `risk:low`, `blocked` |

## Ready-state transitions

- Remove `blocked` and add `agent:ready` only when the issue's dependencies in `docs/agent/UI_PASS_7_EXECUTION_MAP.md` are complete.
- Keep `needs:human-review` on `#185`, `#198`, and `#199` even after they become ready.
- Do not use both `agent:ready` and `blocked` at the same time.
