# UI Pass 7 GitHub Updates

Status: Partially applied reference
Purpose: Record the Pass 7 GitHub writeback content, what was applied through the GitHub connector, and what still remains blocked
Read when: Reconciling GitHub metadata, checking what comments were posted, or finishing the remaining label and milestone backfill
Do not use for: Runtime truth or shipped UX status
Superseded by: Live GitHub issue state once label and milestone reconciliation is complete
Reason partially blocked: local `gh` auth is still invalid, and this environment still has no milestone-creation path

Latest verification:

- `2026-06-11`: `gh auth status` still reports `The token in default is invalid.`
- `2026-06-12`: Pass 7 issue comments for `#171-#199`, closeout comments for `#146`, `#198`, and `#199`, and issue closures for `#146-#202` were applied through the GitHub connector.

## Applied on GitHub

- issue comments are now posted for the Pass 7 queue, including the route batches, final audit, closeout, and parent-epic closeout update
- issues `#146-#202` are now closed with state reason `completed`

## Still not fully reconciled

- local `gh auth` is still broken, so CLI-driven verification and bulk metadata edits are still unavailable
- milestone assignment is still missing on the Pass 7 issues because this environment has no milestone creation or lookup path
- label coverage is partial: some Pass 7 labels were applied earlier, but the full label matrix in `docs/agent/UI_PASS_7_LABEL_PLAN.md` was not reconciled issue-by-issue on GitHub

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

## Issue #198 comment

```md
Implemented locally because GitHub write auth is still unavailable in this environment.

Artifacts:
- final audit note: `docs/implementation-notes/2026-06-11-pass-7-final-audit.md`
- rubric: `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`
- screenshot packet: `apps/web/test-results/pass-7/final-audit/`

Audit result:
- Pass 7 final audit passed on `2026-06-11`
- no route scored `0`
- every route average is at least `2.4`
- `Home` and `Capture` each clear the higher `2.7` threshold

Residual weaknesses called out in the audit instead of hidden:
- AppShell is acceptable but still not perfect; mobile shell chrome remains dense and the quick-capture disclosure still spends vertical space above some route bodies
- Review is calmer than before but still the densest audited workflow route on desktop
```

## Issue #199 comment

```md
Implemented locally because GitHub write auth is still unavailable in this environment.

Artifacts:
- closeout audit: `docs/implementation-notes/2026-06-11-pass-7-final-audit.md`
- updated roadmap truth: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- updated shipped handoff: `docs/PROJECT_STATE.md`

What changed:
- Pass 7 is now marked closed instead of active
- the roadmap is back in maintenance posture and does not invent a fake next pass
- the route scorecard now records residual guardrails instead of still claiming final audit is pending

Known remaining gaps outside Pass 7 scope:
- GitHub CLI auth is still broken locally, so labels and milestone backfill remain partially manual
- issue `#93` production acceptance proof is still incomplete
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

## Issue #160 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- first-viewport browser proof:
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
  - `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- Capture hierarchy runtime adjustments:
  - `apps/web/src/app/capture/page.tsx`
  - `apps/web/src/app/components/AppShell.tsx`

What changed:
- Home and Capture now have explicit `390px` first-viewport tests that check the dominant task surface and primary action arrive before support or diagnostic content
- `/capture` now suppresses the shell quick-note composer because it duplicated the route's own raw-input job and crowded the first viewport
- the Capture route now places the raw-entry card, textarea, and `Save thought` action ahead of the support summary and `Capture details` on mobile without changing raw-save or parse safety behavior
```

## Issue #165 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- severity vocabulary: `docs/agent/UI_SEVERITY_VOCABULARY.md`
- roadmap wiring: `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
- UI guide routing update: `docs/agent/UI_AGENT_GUIDE.md`

What changed:
- Pass 7 now has one compact severity vocabulary for `success`, `info`, `warning`, and `danger`
- the vocabulary explicitly separates calm degraded-but-usable states from blocked or failed states
- the doc also records the current primitive mapping so future work can use `info` intent without forcing a broad component rewrite first
```

## Issue #161 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- focused severity tests:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/src/__tests__/healthPage.test.tsx`
- narrow route-state fix:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/health/page.tsx`

What changed:
- severity tests now prove that recoverable degraded states do not read like hard failures, while blocked trust still does
- Home account-data degradation now uses warning severity because local workflow remains usable
- Health now exposes canonical `data-severity` proof on its main status surfaces so `info`, `warning`, and `danger` can be asserted without brittle color-only tests
```

## Issue #163 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- focused diagnostics-order tests:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/src/__tests__/routeSmoke.test.tsx`
- browser hierarchy proof:
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- narrow shell fix:
  - `apps/web/src/app/components/AppShell.tsx`

What changed:
- Home and Capture now have direct regression coverage proving their details and diagnostic disclosures stay after the primary action contract
- `/` now joins the quiet-shell route set so the shell context band no longer pushes Home support content above the route-local launchpad
- the workflow hierarchy browser suite now passes again at `390px` with Home and Capture both keeping action ahead of details
```

## Issue #164 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- screenshot workflow: `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`
- routing update: `docs/agent/UI_AGENT_GUIDE.md`

What changed:
- Pass 7 now has one operational screenshot workflow instead of scattered proof reminders
- the workflow defines the minimum required images, the local storage location under ignored `apps/web/test-results/`, filename guidance, and the short review note that must accompany each screenshot set
- the UI guide now points to that workflow when screenshot proof is required
```

## Issue #168 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- mobile budget rule: `docs/agent/UI_MOBILE_SURFACE_BUDGET.md`
- review wiring: `docs/agent/UI_AGENT_GUIDE.md`
- issue-template wiring: `.github/ISSUE_TEMPLATE/agent-task.yml`
- static proof hook: `apps/web/src/__tests__/sourceOfTruth.test.ts`

What changed:
- Pass 7 now has one explicit `390px` first-viewport clutter budget for shell and route work
- the UI guide and issue template now require reviewers to state whether a changed route stayed inside that budget and what moved lower or behind disclosure
- source-of-truth coverage now protects the existence of that budget and its review hook so later shell work cannot quietly drop it
```

## Issue #162 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- focused shell clutter tests:
  - `apps/web/src/__tests__/routeSmoke.test.tsx`
  - `apps/web/tests/e2e/shell-clutter.spec.ts`

What changed:
- quiet routes now have explicit regression coverage for the extra shell context band staying off
- Home and Capture now have explicit regression coverage for keeping shell quick-note controls off
- mobile shell coverage now also proves there is one active nav item and one visible shell input path on a non-quiet route without horizontal overflow
```

## Issue #166 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- degraded-state copy rule: `docs/agent/UI_DEGRADED_STATE_COPY.md`
- narrow runtime alignments:
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/lib/statusVocabulary.ts`
- focused proof:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/src/__tests__/capture.test.tsx`

What changed:
- Pass 7 now has one explicit degraded-state copy contract: say what happened, what still works, and the next move
- Home degraded account-data copy now points users toward the safe next move instead of stopping at a warning
- the shared Capture AI-unavailable detail now explains fallback behavior and the optional next setup step without leaking technical jargon
```

## Issue #167 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- detail-boundary rule: `docs/agent/UI_DETAILS_BOUNDARY.md`
- disclosure primitive update:
  - `apps/web/src/app/components/DiagnosticsDisclosure.tsx`
- Health example and focused proof:
  - `apps/web/src/app/health/page.tsx`
  - `apps/web/src/__tests__/diagnosticsDisclosure.test.tsx`
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`

What changed:
- `DiagnosticsDisclosure` now distinguishes `system` versus `developer` detail explicitly through a shared `detailLevel` seam
- Health keeps repair-facing system detail visible, while technical identifiers now sit under an explicit developer disclosure
- the static guard now protects the new detail-boundary docs and the shared disclosure semantics so later route work has one durable standard
```

## Issue #169 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- shell/nav runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
- focused proof:
  - `apps/web/src/__tests__/routeSmoke.test.tsx`
  - `apps/web/src/__tests__/appShellAccent.test.tsx`
  - `apps/web/tests/e2e/shell-clutter.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/169-areas-nav-role/mobile-triage-shell.png`
  - `apps/web/test-results/pass-7/169-areas-nav-role/desktop-triage-shell.png`
  - `apps/web/test-results/pass-7/169-areas-nav-role/mobile-areas-shell.png`
  - `apps/web/test-results/pass-7/169-areas-nav-role/desktop-areas-shell.png`

What changed:
- `Areas` no longer sits inside the primary workflow loop nav beside Capture, Triage, Planning, Execute, Review, and Health
- the shell now exposes `Areas admin` through a separate supporting nav affordance so ownership/admin work reads as secondary without losing access
- focused DOM and Playwright proof now guard that split so later shell work cannot quietly promote `Areas` back into the primary loop
```

## Issue #170 comment

```md
Implemented locally because GitHub write auth is unavailable in this environment.

Artifacts:
- shell/nav runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
- browser proof:
  - `apps/web/tests/e2e/shell-clutter.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/170-mobile-nav-calm/mobile-triage-shell.png`
  - `apps/web/test-results/pass-7/170-mobile-nav-calm/mobile-areas-shell.png`
  - `apps/web/test-results/pass-7/170-mobile-nav-calm/desktop-triage-shell.png`

What changed:
- the mobile primary nav now stays on one horizontal lane instead of wrapping into multiple rows
- route access is preserved by horizontal scroll rather than by stacking more shell height above the route
- Playwright now asserts the mobile primary nav stays single-row on non-quiet routes so later shell work cannot quietly reintroduce the wrapped chip cloud
```

## Issue #171 comment

```md
Implemented locally.

Artifacts:
- runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
- focused proof:
  - `apps/web/src/__tests__/routeSmoke.test.tsx`
  - `apps/web/tests/e2e/shell-clutter.spec.ts`
  - `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/171-shell-route-behavior/2026-06-11-171-triage-mobile-rest.png`
  - `apps/web/test-results/pass-7/171-shell-route-behavior/2026-06-11-171-triage-desktop-rest.png`

What changed:
- the shell quick-note composer is now collapsed by default on non-quiet routes and only opens after an explicit `Quick note` action
- route-local work now lands ahead of shell note input and save controls in the resting first viewport
- Home and Capture keep their stricter shell suppression unchanged, so this pass only quieted the routes that still needed it
```

## Issue #172 comment

```md
Implemented locally.

Artifacts:
- runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
- focused proof:
  - `apps/web/tests/e2e/shell-clutter.spec.ts`
  - `apps/web/tests/e2e/app-shell-accent.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/172-area-display-pass/2026-06-11-172-triage-mobile-rest.png`
  - `apps/web/test-results/pass-7/172-area-display-pass/2026-06-11-172-triage-desktop-rest.png`

What changed:
- the duplicate shell-level area spotlight was removed from the non-quiet context header
- area stays visible through the persistent shell area control, so trust is preserved without repeating the same context twice
- focused browser proof now guards the quieter first viewport on mobile and desktop
```

## Issue #173 comment

```md
Implemented locally as part of the Capture hierarchy recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/capture/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/173-176-capture-hierarchy/2026-06-11-173-176-capture-mobile-rest.png`
  - `apps/web/test-results/pass-7/173-176-capture-hierarchy/2026-06-11-173-176-capture-desktop-rest.png`

What changed:
- Capture now lands on the raw-input card first instead of summary or detail surfaces
- the textarea plus the two primary save actions remain in the first viewport at `390px`
- focused browser proof now asserts that the main capture card stays ahead of support summary content and `Capture details`
```

## Issue #174 comment

```md
Implemented locally together with `#173`.

Artifacts:
- route hierarchy update:
  - `apps/web/src/app/capture/page.tsx`
- focused proof:
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

What changed:
- the primary save controls stay directly under the raw-input surface instead of being pushed below metrics or diagnostics
- optional area selection remains available near the action cluster without becoming a competing support surface
- browser proof now guards that both primary save actions stay ahead of support and diagnostic content at rest
```

## Issue #175 comment

```md
Implemented locally together with `#173`.

Artifacts:
- route copy and disclosure alignment:
  - `apps/web/src/app/capture/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

What changed:
- `Capture details` remains available, but it stays clearly after the main capture actions and support summary
- device-only draft history remains behind disclosure instead of competing with the raw-entry job
- focused tests now guard that local draft and diagnostic disclosures stay after the primary actions
```

## Issue #176 comment

```md
Implemented locally together with `#173-#175`.

Artifacts:
- route copy update:
  - `apps/web/src/app/capture/page.tsx`
- focused test updates:
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/tests/e2e/workflow-card-accent.spec.ts`

What changed:
- the Capture action cluster now uses calmer, more direct labels: `Choose what happens next`, `Save the thought now, or send drafts to Triage.`, and `Optional area`
- the local organize disclosure now reads `Organize on this device`, with supporting copy that keeps browser-local drafts explicitly secondary
- test selectors were tightened to target the actual controls instead of ambiguous repeated text, which makes the proof less brittle
```

## Issue #177 comment

```md
Implemented locally as an explicit proof closeout after `#173-#176`.

Artifacts:
- focused safety proof:
  - `apps/web/src/__tests__/capture.test.tsx`
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`
- batch proof note:
  - `docs/implementation-notes/2026-06-11-capture-hierarchy-recovery.md`

What changed:
- no new runtime behavior was needed because Capture already preserved raw-save-first semantics
- focused tests now re-prove that `Save thought` persists raw text first, save failures stay explicit, and parse failures still say the raw capture is safely stored
- static source-of-truth coverage still keeps parser and Google Calendar boundaries out of the client route while the hierarchy cleanup stays landed
```

## Issue #178 comment

```md
Implemented locally as part of the Home launchpad recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/178-181-home-launchpad/2026-06-11-178-181-home-mobile-rest.png`
  - `apps/web/test-results/pass-7/178-181-home-launchpad/2026-06-11-178-181-home-desktop-rest.png`

What changed:
- Home degraded account-data copy now reads more calmly and accurately: some account data did not load, local workflow still works, and Health is the next diagnostic stop if the problem persists
- the route still exposes the warning truth when account data fails partially, but it no longer sounds like a total outage
- the Home launchpad remains usable and read-only under that degraded state
```

## Issue #179 comment

```md
Implemented locally together with `#180`.

Artifacts:
- runtime update:
  - `apps/web/src/app/page.tsx`
- browser proof:
  - `apps/web/tests/e2e/p0-ux-regression.spec.ts`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

What changed:
- Home now reads more clearly as a launchpad instead of a mini dashboard
- the separate `Daily loop` empty-state card was removed because it duplicated the flagship launch surface
- the read-only launch guidance now lives as a quieter note inside the `Today / Next` card instead of as its own support surface
```

## Issue #180 comment

```md
Implemented locally together with `#179`.

Artifacts:
- runtime update:
  - `apps/web/src/app/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`

What changed:
- Home support-card clutter dropped by one full surface at rest because the `Daily loop` card is gone
- the flagship disclosure label was shortened from `Suggested follow-through` to `After this`
- first-viewport browser proof now captures the quieter mobile and desktop Home resting state directly
```

## Issue #181 comment

```md
Implemented locally as explicit proof after the Home cleanup.

Artifacts:
- focused proof:
  - `apps/web/src/__tests__/page.test.tsx`
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - `apps/web/tests/e2e/p0-ux-regression.spec.ts`
- batch proof note:
  - `docs/implementation-notes/2026-06-11-home-launchpad-recovery.md`

What changed:
- Home still exposes no mutation controls and still routes the user to workflow screens instead of changing workflow state directly
- unit and browser proof now check the quieter launchpad structure rather than the removed `Daily loop` card
- the route remains read-only while the UI gets simpler
```

## Issue #182 comment

```md
Implemented locally as part of the Triage recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/triage/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/triage.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/182-183-triage-decision/2026-06-11-182-183-triage-mobile-rest.png`
  - `apps/web/test-results/pass-7/182-183-triage-decision/2026-06-11-182-183-triage-desktop-rest.png`

What changed:
- Triage now lands directly on the current item instead of a summary or preamble card about the current item
- focused browser proof now asserts the current decision sits ahead of queue summary and route diagnostics on mobile and desktop
- the old `Current focus` support card was removed because it duplicated the flagship decision surface
```

## Issue #183 comment

```md
Implemented locally together with `#182`.

Artifacts:
- runtime update:
  - `apps/web/src/app/triage/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/triage.test.tsx`
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`

What changed:
- support context and queue summary now stay secondary to the current decision
- Triage details remain available, but they now land after the current item and lower support surfaces
- persistence and static truth tests now protect the quieter current-item-first contract instead of the removed preamble card
```

## Issue #184 comment

```md
Implemented locally as part of the Planning recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/calendar/page.tsx`
- focused proof:
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/184-185-planning-flow/2026-06-11-184-185-planning-mobile-rest.png`
  - `apps/web/test-results/pass-7/184-185-planning-flow/2026-06-11-184-185-planning-desktop-rest.png`

What changed:
- Planning now lands on the local-first `Planning flow` flagship before support summary or route diagnostics
- the old header spotlight summary moved lower into a quieter `Planning snapshot` support card
- browser proof now asserts the local-first flow stays ahead of that summary and of `Planning details` on mobile and desktop
```

## Issue #185 comment

```md
Implemented locally together with `#184` without changing Google behavior.

Artifacts:
- runtime update:
  - `apps/web/src/app/calendar/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`

What changed:
- `Google Calendar options` now reads `Google write approval` because the surface is an explicit approval gate
- the lead copy now says `Google write only happens after you approve it.`
- Google write behavior, approval gating, OAuth scope, and persistence rules are unchanged; only the staging and wording are clearer
```

## Issue #186 comment

```md
Implemented locally as the Execute recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/execute/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/executeFocusPolish.test.tsx`
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/186-execute-mission/2026-06-11-186-execute-mobile-rest.png`
  - `apps/web/test-results/pass-7/186-execute-mission/2026-06-11-186-execute-desktop-rest.png`

What changed:
- Execute now keeps the current mission clearly above the quieter visible-state card and the new `Next move` support lane
- the redundant top-of-route `Mission record` disclosure was removed because it competed with the flagship mission surface
- focused browser proof now asserts the mission card stays above both support surfaces on mobile and desktop
```

## Issue #187 comment

```md
Implemented locally as the Review recovery batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/review/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/187-review-carry-forward/2026-06-11-187-review-mobile-rest.png`
  - `apps/web/test-results/pass-7/187-review-carry-forward/2026-06-11-187-review-desktop-rest.png`

What changed:
- Review now keeps the closure flagship and carry-forward actions visible first
- the carry-forward board plus saved-history surfaces moved behind the lower `Review details and history` disclosure
- browser proof now asserts those heavier board/history surfaces stay below the carry-forward action path at rest
```

## Issue #188 comment

```md
Implemented locally as the Health diagnostic-home batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/health/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/healthPage.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/188-health-diagnostic-home/2026-06-11-188-health-mobile-rest.png`
  - `apps/web/test-results/pass-7/188-health-diagnostic-home/2026-06-11-188-health-desktop-rest.png`

What changed:
- Health now states more explicitly that it is the diagnostic home when other workflow routes point the user here
- the first-load success alert was removed so the flagship trust answer stays in the first mobile viewport instead of being pushed down by celebratory feedback
- manual re-runs still surface clear success or failure feedback near the action, so repair truth stays explicit without cluttering the resting state
```

## Issue #189 comment

```md
Implemented locally as the Areas admin-registry batch.

Artifacts:
- runtime update:
  - `apps/web/src/app/settings/areas/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/workflowAreaAccent.test.tsx`
  - `apps/web/src/__tests__/phase4aPersistence.test.tsx`
  - `apps/web/tests/e2e/workflow-hierarchy.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/189-areas-admin-registry/2026-06-11-189-areas-mobile-rest.png`
  - `apps/web/test-results/pass-7/189-areas-admin-registry/2026-06-11-189-areas-desktop-rest.png`

What changed:
- Areas no longer opens with a separate header summary card above the flagship create-area surface
- registry details now sit below the create card, area record actions are calmer, and the Google section now reads as `Google Calendar admin`
- browser proof now asserts the create-area card stays above registry records and lower admin detail on mobile and desktop
```

## No body replacement required yet

- `#146` already has the child issue index and phase grouping.
- `#200` already states the backlog-hardening goal and acceptance criteria.
- The shared execution map was chosen deliberately to avoid bloating every child issue body with repeated control-plane text.

## Issue #190 comment

```md
Implemented locally as the first visual-system restraint slice.

Artifacts:
- runtime update:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/ui/card.tsx`
- browser proof:
  - `apps/web/tests/e2e/workflow-card-accent.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/190-card-depth-restraint/2026-06-11-190-home-desktop-rest.png`
  - `apps/web/test-results/pass-7/190-card-depth-restraint/2026-06-11-190-areas-mobile-rest.png`

What changed:
- shared flagship, support, admin, and nested panel surfaces now read with less stacked depth and fewer competing card variants
- the fix landed primarily in the shared surface layer instead of route-by-route card churn
- route hierarchy is unchanged; the UI just feels less boxed in
```

## Issue #191 comment

```md
Implemented locally together with `#190`.

Artifacts:
- runtime update:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/components/ui/input.tsx`
  - `apps/web/src/components/ui/select.tsx`
  - `apps/web/src/components/ui/textarea.tsx`
- browser proof:
  - `apps/web/tests/e2e/workflow-card-accent.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/191-type-density/2026-06-11-191-execute-desktop-rest.png`

What changed:
- shared type rhythm, header spacing, and control density are tighter and calmer
- dark-mode muted and border contrast is slightly stronger so authored surfaces read more cleanly
- the `sm` button size now clears the same touch-friendly floor as the default button instead of shrinking below it
```

## Issue #192 comment

```md
Implemented locally as the shared visual-noise reduction slice.

Artifacts:
- runtime update:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/ui/button.tsx`
  - `apps/web/src/components/ui/card.tsx`
- browser proof:
  - `apps/web/tests/e2e/workflow-card-accent.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/192-visual-restraint/2026-06-11-192-review-desktop-rest.png`
  - `apps/web/test-results/pass-7/192-visual-restraint/2026-06-11-192-capture-mobile-rest.png`

What changed:
- shadows, gradients, inset highlights, and accent spill are all quieter across shared workflow surfaces
- support and admin surfaces now compete less with flagship route cards
- LifeOS route identity remains authored; only the excess visual noise was removed
```

## Issue #193 comment

```md
Implemented locally as the mobile control-density pass.

Artifacts:
- runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
  - `apps/web/src/components/ui/button.tsx`
- focused proof:
  - `apps/web/src/__tests__/appShellAccent.test.tsx`
- browser proof:
  - `apps/web/tests/e2e/workflow-card-accent.spec.ts`
- screenshot evidence:
  - `apps/web/test-results/pass-7/193-mobile-targets/2026-06-11-193-execute-mobile-shell-targets.png`

What changed:
- primary nav pills, supporting nav, area selection, quick-note entry, and shell status controls now keep a touch-friendly mobile target floor
- the shell still stays calmer than earlier passes because the target increase landed alongside the shared surface restraint work
- browser proof now asserts that those core mobile shell controls stay at or above the target floor instead of relying on screenshots alone
```

## Issue #194 comment

```md
Implemented locally as the accessibility-baseline hardening pass.

Artifacts:
- runtime update:
  - `apps/web/src/app/components/AppShell.tsx`
  - `apps/web/src/app/components/WorkflowLoadingState.tsx`
  - `apps/web/src/app/capture/page.tsx`
  - `apps/web/src/app/triage/page.tsx`
  - `apps/web/src/app/calendar/page.tsx`
  - `apps/web/src/app/execute/page.tsx`
  - `apps/web/src/app/review/page.tsx`
  - `apps/web/src/app/settings/areas/page.tsx`
- focused proof:
  - `apps/web/src/__tests__/sourceOfTruth.test.ts`
- browser proof:
  - `apps/web/tests/e2e/accessibility-baseline.spec.ts`

What changed:
- non-destructive workflow feedback now announces through polite live regions instead of relying on default alert semantics
- browser proof now checks representative dark-mode contrast, visible keyboard focus, and status semantics on real workflow surfaces
- the fix stayed in shared semantics and proof; route hierarchy and product behavior are unchanged
```

## Issue #195 comment

```md
Implemented locally as the reduced-motion restraint pass.

Artifacts:
- runtime update:
  - `apps/web/src/app/globals.css`
- browser proof:
  - `apps/web/tests/e2e/motion-performance.spec.ts`

What changed:
- reduced-motion mode now explicitly suppresses the running focus-orb transition in addition to the existing celebration and primary-card motion cuts
- browser proof now checks reduced-motion behavior on interactive shell chrome, celebration feedback, and Execute focus-state motion
- motion stays authored where allowed, but it now proves it can get out of the way when the user asks
```

## Issue #196 comment

```md
Implemented locally as the perceived-speed and layout-stability proof pass.

Artifacts:
- browser proof:
  - `apps/web/tests/e2e/motion-performance.spec.ts`

What changed:
- the new performance proof warms Capture, then checks that the route becomes usable quickly on client-side navigation instead of waiting for support data
- the same proof now guards that the flagship capture card does not jump materially after the route settles
- this is intentionally perceived-speed proof, not a brittle cold-compile benchmark
```

## Issue #197 comment

```md
Implemented locally by extending the existing screenshot workflow into the final packet format.

Artifacts:
- docs update:
  - `docs/agent/UI_SCREENSHOT_EVIDENCE_WORKFLOW.md`
- proof note:
  - `docs/implementation-notes/2026-06-11-accessibility-motion-performance-evidence.md`

What changed:
- the screenshot workflow now defines the final packet section order instead of stopping at per-issue capture rules
- the doc now includes the current Pass 7 packet index, pointing at the already-captured screenshot folders that the final audit should use
- final audit prep now has one evidence format instead of scattered screenshot reminders across issue comments and notes
```
