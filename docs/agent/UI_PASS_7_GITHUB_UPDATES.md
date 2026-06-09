# UI Pass 7 GitHub Updates

Status: Pending application
Purpose: Store the exact GitHub comments or body updates blocked by invalid authentication in this environment
Read when: GitHub write auth is restored or manual issue backfill is needed
Do not use for: Runtime truth or shipped UX status
Superseded by: Authenticated GitHub comments and metadata once the backfill is applied
Reason not applied: `gh` is installed, but `gh auth status` reports the default token is invalid in this environment

## Issue #146 comment

```md
Pass 7 control-plane update:

- Canonical shared execution context now lives in `docs/agent/UI_PASS_7_EXECUTION_MAP.md`.
- Route issues `#169` through `#199` remain blocked until `#147` through `#168` and `#200` through `#202` are complete, even when a smaller direct dependency exists in the issue body.
- Use the execution map for task type, risk, minimum read set, validation pack, proof expectations, rollback profile, and readiness-state backfill instead of duplicating that context into every issue.
```

## Issue #200 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- shared execution map: `docs/agent/UI_PASS_7_EXECUTION_MAP.md`
- governance proof note: `docs/implementation-notes/2026-06-08-pass-7-issue-hardening.md`

What changed:
- dependency order is explicit by gate, not just by issue number
- route issues are globally blocked until docs/setup/tests gates complete
- every Pass 7 issue now has a shared task-type, risk, read-set, validation, proof, rollback, and readiness mapping in repo docs

Remaining GitHub-side follow-up:
- apply label and readiness metadata in `#201`
- wire the final audit rubric link in `#202`
```

## Issue #201 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- label taxonomy and issue mapping: `docs/agent/UI_PASS_7_LABEL_PLAN.md`
- shared dependency and readiness source: `docs/agent/UI_PASS_7_EXECUTION_MAP.md`

Key decisions:
- reuse existing `area:*`, `risk:*`, and `agent:*` labels instead of creating duplicate synonyms
- create only the missing Pass 7 route, quality, and readiness labels
- use one milestone only: `UI UX Recovery Epic Pass 7`
- keep route issues blocked until the docs, setup, and test gates are complete
```

## Issue #202 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- final audit rubric: `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`
- dependency and closeout wiring: `docs/agent/UI_PASS_7_EXECUTION_MAP.md`

Key decisions:
- the final audit now has one canonical rubric outside the issue body
- `#198` should use that rubric directly rather than ad hoc route commentary
- `#199` must not close unless the rubric is filled with real screenshot, test, and behavior evidence
```

## Issue #147 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifact:
- UI/UX doc inventory: `docs/agent/UI_UX_DOC_INVENTORY.md`

Current inventory result:
- active plan: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- UX authority: `docs/UX_FLOWS.md`
- shipped truth and handoff: `docs/PROJECT_STATE.md`
- main conflict set: the old `docs/ux/*` plan/scorecard pair and the `docs/superpowers/*` plan/spec pair can still be mistaken for active planning docs unless they are explicitly demoted
```

## Issue #148 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- doc inventory: `docs/agent/UI_UX_DOC_INVENTORY.md`
- updated active roadmap: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`

What changed:
- the roadmap now names Pass 7 as the active implementation pass
- Passes 0 through 6 are explicitly treated as shipped history and guardrails
- the older `docs/ux/*` and `docs/superpowers/*` UX plan/spec docs are now called out as historical inputs rather than active program state
```

## Issue #149 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- archive bundle: `docs/archive/ui-ux/`
- updated inventory: `docs/agent/UI_UX_DOC_INVENTORY.md`
- updated roadmap historical-input references: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`

What changed:
- the older UX plan, scorecard, design brief, and implementation plan were preserved under an explicit archive path
- the old live-path files now act as short redirect stubs instead of full competing plan documents
- the active roadmap and inventory now point to the archive bundle instead of leaving historical docs in the live planning path
```

## Issue #150 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- cleaned handoff doc: `docs/PROJECT_STATE.md`
- proof note: `docs/implementation-notes/2026-06-08-project-state-handoff-cleanup.md`

What changed:
- `PROJECT_STATE` is now a real handoff file instead of a phase diary
- older delivery history was removed from the main handoff path in favor of roadmap and implementation-note links
- the file now states that Pass 7 is active and should not be treated as closed before `#198` and `#199`
```

## Issue #151 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated headers across the relevant UI/UX docs
- proof note: `docs/implementation-notes/2026-06-08-ui-ux-status-header-pass.md`

What changed:
- the remaining high-value UI/UX docs now declare status, purpose, read-when, and do-not-use-for explicitly
- `Superseded by` is now present where routing value exists, especially on archived or temporary control-plane docs
- the old ad hoc top blocks on the GitHub update queue and related docs were normalized into the same scan-first contract
```

## Issue #152 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- new UI routing guide: `docs/agent/UI_AGENT_GUIDE.md`
- updated UI context route: `docs/agent/CONTEXT_INDEX.md`
- updated `pnpm agent:context ui` source: `docs/agent/REPO_MAP.json`

What changed:
- the `ui` context path now routes through the active roadmap, the compact UI agent guide, the Pass 7 execution map, and only then into current shipped truth and touched route proof
- the old default jump into a June implementation note was removed
- historical notes and archived UX docs are now explicitly opt-in only
```

## Issue #153 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated high-authority rule in `AGENTS.md`
- duplicate-plan guardrail in `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- matching operational rule in `docs/agent/UI_AGENT_GUIDE.md`

What changed:
- future agents are now told explicitly to amend the active UI/UX roadmap instead of opening a second live plan
- if the roadmap must be replaced, it must be retired or archived first
- implementation notes stay proof-only and temporary control-plane docs must not present themselves as the active roadmap
```

## Issue #154 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated active roadmap: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- proof note: `docs/implementation-notes/2026-06-08-ui-ux-roadmap-reopen-clarity-staging.md`

What changed:
- the roadmap now explicitly says Pass 7 is active for clarity, diagnostic staging, route restraint, mobile-first hierarchy, and final proof
- outcome-gap and route-gap language no longer frames the remaining UI work as maintenance-only
- `docs/PROJECT_STATE.md` now reflects the reopened roadmap posture in its recent-work summary
```

## Issue #155 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- doctrine doc: `docs/agent/UI_INFORMATION_HIERARCHY_DOCTRINE.md`
- roadmap wiring: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- routing update: `docs/agent/UI_AGENT_GUIDE.md`

What changed:
- Pass 7 now has one compact doctrine for user action truth, safety truth, diagnostic truth, and developer truth
- the roadmap now treats that doctrine as part of the active Pass 7 acceptance framing
- future UI work now has an explicit rule for what belongs in the main route surface versus details or Health
```

## Issue #156 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- expanded UI guide: `docs/agent/UI_AGENT_GUIDE.md`
- roadmap wiring: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- handoff note: `docs/PROJECT_STATE.md`

What changed:
- the UI agent guide now defines the review loop before a UI issue can be called done
- the guide now requires behavior checks, focused tests, and mobile plus desktop proof when hierarchy or shell behavior changed
- Pass 7 acceptance now explicitly includes the review guide instead of relying on ad hoc review habits
```

## Issue #157 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated routing index: `docs/agent/CONTEXT_INDEX.md`
- updated `pnpm agent:context ui` source: `docs/agent/REPO_MAP.json`

What changed:
- the `ui` routing path now points to the active roadmap and UI review guide before implementation
- touched route source and focused tests now come before `PROJECT_STATE` unless shipped-truth status is actually needed
- `pnpm agent:context ui` now treats `PROJECT_STATE` as conditional context instead of default read-first context
```

## Issue #158 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated issue template: `.github/ISSUE_TEMPLATE/agent-task.yml`

What changed:
- route-level UI tasks now have an explicit `UI proof requirements` field
- the template now asks for mobile proof, desktop proof, tests run, what became simpler, and what stayed intentionally unchanged
- UI validation guidance now treats screenshot and simplification proof as part of completion, not optional commentary
```

## Issue #159 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- updated source-of-truth and route tests:
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`

What changed:
- primary-route tests no longer require technical labels like `Save mode:` or `Technical save mode id:` on Capture, Areas, or Review surfaces
- source-of-truth coverage still protects user-facing action and safety copy, while leaving technical detail expectations to intentional details and Health
- focused route tests still prove save behavior and persistence truth without locking in clutter-heavy implementation copy
```

## No body replacement required yet

- `#146` already has the child issue index and phase grouping.
- `#200` already states the backlog-hardening goal and acceptance criteria.
- The shared execution map was chosen deliberately to avoid bloating every child issue body with repeated control-plane text.
