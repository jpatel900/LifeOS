# UI Pass 7 Execution Map

Status: Active control-plane supplement for GitHub issues `#146` through `#202`
Purpose: Carry the shared implementation context that should not be duplicated into every Pass 7 issue body
Read when: Preparing, implementing, reviewing, or auditing Pass 7 work
Do not use for: Shipped product truth. `AGENTS.md`, `docs/UI_UX_WORLD_CLASS_ROADMAP.md`, runtime behavior, tests, and `docs/PROJECT_STATE.md` remain authoritative for product state.
Superseded by: Authenticated GitHub issue metadata plus final closeout docs once Pass 7 is fully backfilled and closed

This file mirrors the fields used by `.github/ISSUE_TEMPLATE/agent-task.yml` so the Pass 7 issue set can stay short without becoming underspecified.

## Shared boundaries

Apply these boundaries to every Pass 7 issue unless an issue explicitly adds a stricter rule:

- Do not broaden scope beyond the named issue or dependency gate.
- Do not change schema, migrations, RLS, auth, OAuth scopes, parser contracts, or observability privacy behavior.
- Do not change Google Calendar write behavior or approval gates.
- Do not add silent external writes.
- Do not remove mock or local fallback behavior.
- Do not create a second active UI/UX roadmap.
- Do not claim completion from docs alone when runtime, tests, or screenshots disagree.

## Dependency order

Pass 7 runs in gates, not by raw issue number:

1. `#200`, `#201`, `#202` meta hardening
2. `#147` to `#153` docs hygiene
3. `#154` to `#158` roadmap and review setup
4. `#159` to `#168` tests and shared UX rules
5. `#169` to `#189` shell and route implementation
6. `#190` to `#193` final visual system cleanup
7. `#194` to `#197` accessibility, motion, performance, and evidence
8. `#198` and `#199` audit and closeout

Global block rule:

- Issues `#169` to `#199` are blocked until `#147` to `#168` and `#200` to `#202` are complete, even if their direct issue-body dependency is smaller.

## Shared context packs

| Code | Read set |
| --- | --- |
| `C0` | `AGENTS.md`, `docs/agent/CONTEXT_INDEX.md`, this file, `docs/UI_UX_WORLD_CLASS_ROADMAP.md`, `docs/UX_FLOWS.md`, `docs/PROJECT_STATE.md` only as needed, `docs/agent/CODEX_PROMPT_TEMPLATE.md` |
| `C1` | `C0` + `.github/ISSUE_TEMPLATE/agent-task.yml` + `docs/implementation-notes/README.md` |
| `C2` | `C0` + target docs in `docs/**` and repo governance docs already named by the issue |
| `C3` | `C0` + touched route source, focused route tests, latest roadmap-linked implementation note, and relevant Playwright specs |
| `C4` | `C3` + `docs/SECURITY_PRIVACY.md` and calendar approval/source-of-truth tests |
| `C5` | `C3` + Health route/tests and any deterministic status helpers or route smoke coverage tied to Health semantics |
| `C6` | `C3` + `apps/web/src/app/globals.css`, shared UI primitives, shell components, and route screenshot proof surfaces |

## Shared validation packs

| Code | Validation |
| --- | --- |
| `V0` | `git diff --check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build` |
| `V1` | `V0` + focused tests for touched docs, routing guidance, or issue-template semantics where applicable |
| `V2` | `V0` + focused unit/integration tests for the touched route or helper surface |
| `V3` | `V2` + relevant Playwright coverage + mobile and desktop screenshot or manual browser proof |
| `V4` | `V3` + source-of-truth and approval-gate coverage for safety-sensitive route work |
| `V5` | `V3` + route-by-route audit packet, screenshots, and rubric scoring evidence |

## Shared proof rules

- Docs and governance issues must state exactly which docs became the live control surface and which docs remain historical.
- Test issues must harden the desired user experience, not preserve clutter or implementation jargon in primary workflow surfaces.
- Route issues must show mobile and desktop first-viewport evidence when the first scan changes.
- Safety-sensitive route issues must prove what stayed unchanged, not just what moved visually.

## Shared rollback profiles

| Code | Rollback rule |
| --- | --- |
| `R0` | Revert touched docs only. Do not rewrite unrelated roadmap or handoff content. |
| `R1` | Revert touched tests only, or revert the coupled doc/test pair if assertions encode new policy. |
| `R2` | Revert the touched route UI and its focused tests only. Preserve unrelated shared primitive or shell work. |
| `R3` | Revert the touched UI, proof docs, and focused tests only. Do not roll back calendar, auth, persistence, or other runtime behavior outside the scoped surface. |
| `R4` | Revert audit and closeout docs only. Do not claim partial completion as shipped truth. |

## Readiness states

Use these states when backfilling GitHub metadata later:

- `blocked`: prerequisites or global gates are not satisfied.
- `ready-for-codex`: dependencies are complete and the issue has enough context to execute safely.
- `needs-human-review`: sensitive or final-signoff work that should not be closed on agent optimism alone.

## Issue matrix

### Phase 0: Program hardening

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#200` | docs | medium | none | `C1` | `V0` | dependency map, shared context source, explicit route block rule | `R0` | in progress | Backlog is executable without relying on chat-only context. |
| `#201` | docs | medium | `#200` | `C1` | `V0` | label set, readiness-state plan, milestone/project mapping | `R0` | blocked | Backlog can be filtered by phase, route, type, and readiness. |
| `#202` | docs | medium | `#200` | `C1` | `V0` | rubric wired to `#198` with thresholds and proof rules in `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md` | `R0` | blocked | Final audit standards exist before implementation claims start. |

### Phase 1: Documentation hygiene

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#147` | docs | low | `#200` | `C2` | `V0` | UI/UX doc inventory with authority classification and duplicate/stale findings | `R0` | blocked | Inventory identifies active, authority, reference, historical, and archive docs. |
| `#148` | docs | medium | `#147` | `C2` | `V0` | single active roadmap path, no competing active plan | `R0` | blocked | `docs/UI_UX_WORLD_CLASS_ROADMAP.md` becomes the sole active UI/UX plan. |
| `#149` | docs | low | `#148` | `C2` | `V0` | historical plans demoted or archived with live rules extracted first | `R0` | blocked | Old plans stop competing with the roadmap. |
| `#150` | docs | low | `#147` | `C2` | `V0` | shorter `PROJECT_STATE` handoff path with history moved elsewhere | `R0` | blocked | Handoff doc points to live status and next work only. |
| `#151` | docs | low | `#147` | `C2` | `V0` | status header pattern added to relevant UI/UX docs | `R0` | blocked | Each relevant doc declares status, purpose, and supersession. |
| `#152` | docs | low | `#151` | `C2` | `V0` | UI context route points to active roadmap, guide, source, and tests | `R0` | blocked | Future UI agents load the smallest useful context. |
| `#153` | docs | low | `#152` | `C2` | `V0` | explicit guardrails against duplicate active plans | `R0` | blocked | Agents must amend or retire the active plan before creating another. |

### Phase 2: Roadmap and review setup

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#154` | docs | medium | `#148` | `C2` | `V0` | roadmap shows Pass 7 as active work instead of maintenance-only posture | `R0` | blocked | Roadmap clearly reopens for clarity and diagnostic staging. |
| `#155` | docs | medium | `#154` | `C2` | `V0` | doctrine for user action truth, safety truth, diagnostic truth, developer truth | `R0` | blocked | Future UI work can stage details intentionally. |
| `#156` | docs | medium | `#155` | `C2` | `V0` | UI agent review guide with behavior, screenshots, tests, and route proof | `R0` | blocked | Agents know how to review UI work before claiming done. |
| `#157` | docs | low | `#156` | `C2` | `V0` | routing docs point UI work to roadmap and review guide first | `R0` | blocked | Minimal UI context path is explicit. |
| `#158` | docs | medium | `#156` | `C2` | `V0` | issue guidance requires mobile proof, desktop proof, tests, and unchanged boundaries | `R0` | blocked | Route-level UI issues ask for proof and simplification notes. |

### Phase 3: Tests and shared UX rules

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#159` | tests | medium | `#156` | `C3` | `V2` | test updates stop preserving technical copy on primary workflow surfaces | `R1` | blocked | Tests protect user-facing copy boundaries, not clutter. |
| `#160` | tests | medium | `#159` | `C3` | `V2` | first-viewport tests for Capture and Home at mobile width | `R1` | blocked | Primary task/action must beat diagnostics and support content. |
| `#161` | tests | medium | `#165` | `C3` | `V2` | severity tests distinguish usable degraded states from blocked states | `R1` | blocked | Recoverable states are not styled or described like failures. |
| `#162` | tests | medium | `#168` | `C6` | `V2` | shell/nav clutter regression coverage before shell work continues | `R1` | blocked | Mobile nav and shell elements cannot grow back into clutter. |
| `#163` | tests | medium | `#160` | `C3` | `V2` | diagnostics do not appear before primary action unless the route is blocked | `R1` | blocked | Capture and Home enforce action-before-details. |
| `#164` | docs | low | `#158` | `C2` | `V0` | screenshot workflow explains required images, location, and review notes | `R0` | blocked | Evidence capture is repeatable for UI PRs. |
| `#165` | docs | medium | `#155` | `C2` | `V0` | severity vocabulary defines success, info, warning, and danger intent | `R0` | blocked | Reusable route-state vocabulary exists before copy work. |
| `#166` | docs/ui | medium | `#165` | `C3` | `V2` | friendly degraded-state messages say what happened, what still works, and next move | `R2` | blocked | Common route states become calm and actionable. |
| `#167` | docs/ui | medium | `#155` | `C3` | `V2` | system details vs developer details boundary is standardized | `R2` | blocked | Developer detail stops dominating primary workflow routes. |
| `#168` | docs/tests | medium | `#155` | `C6` | `V1` | mobile surface budget documented and tied to review/tests | `R0` | blocked | Routes get a budget for first-viewport surfaces before shell changes. |

### Phase 4: Shell and navigation

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#169` | ui | medium | `#168` | `C6` | `V3` | Areas reads as supporting/admin in nav | `R2` | blocked | Navigation matches workflow hierarchy. |
| `#170` | ui | medium | `#162`, `#169` | `C6` | `V3` | calmer mobile nav with preserved route access | `R2` | blocked | Mobile chrome no longer crowds the route task. |
| `#171` | ui | medium | `#170` | `C6` | `V3` | shell controls stay secondary to route-local work | `R2` | blocked | First viewport belongs to the route, not the shell. |
| `#172` | ui | medium | `#171` | `C6` | `V3` | repeated area display reduced without hiding area context | `R2` | blocked | Area remains visible without stealing attention. |

### Phase 5: Capture

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#173` | capture/ui | medium | `#160`, `#171` | `C3` | `V3` | textarea and primary save action win the first viewport | `R2` | blocked | Capture becomes raw-input-first on mobile and desktop. |
| `#174` | capture/ui | medium | `#173` | `C3` | `V3` | status metrics move below the action or into details | `R2` | blocked | Metrics stop beating the main task. |
| `#175` | capture/ui | medium | `#174` | `C3` | `V3` | details/history remain available without competing with input/action | `R2` | blocked | Support content is staged after the main action. |
| `#176` | capture/ui | medium | `#173` | `C3` | `V3` | action hierarchy and copy are user-facing and clearly ranked | `R2` | blocked | `Save thought` is visually primary. |
| `#177` | capture/tests | high | `#173` to `#176` | `C3` | `V4` | raw save safety remains provable after simplification | `R3` | blocked | Raw captures stay recoverable if parse/sort fails. |

### Phase 6: Home

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#178` | home/ui | medium | `#165`, `#166` | `C3` | `V3` | degraded states are calm, accurate, and severity-appropriate | `R2` | blocked | Recoverable Home states avoid destructive framing. |
| `#179` | home/ui | medium | `#178` | `C3` | `V3` | main Home card becomes a launchpad instead of a dense dashboard | `R2` | blocked | One obvious next action wins the first viewport. |
| `#180` | home/ui | medium | `#179` | `C3` | `V3` | support cards become secondary and quieter by default | `R2` | blocked | Support content remains useful without crowding the launchpad. |
| `#181` | home/tests | medium | `#179`, `#180` | `C3` | `V2` | Home remains read-only after simplification | `R3` | blocked | Home routes without mutating workflow state directly. |

### Phase 7: Workflow routes

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#182` | triage/ui | medium | `#177` | `C3` | `V3` | one current decision dominates the route | `R2` | blocked | Queue becomes secondary to the active triage decision. |
| `#183` | triage/ui | medium | `#182` | `C3` | `V3` | context details become secondary | `R2` | blocked | AI/system/queue details stop competing with the decision. |
| `#184` | planning/ui | medium | `#183` | `C4` | `V4` | local-first planning flow is clearer without changing safety boundaries | `R3` | blocked | The next proposal action is obvious and separated from Google behavior. |
| `#185` | planning/ui | high | `#184` | `C4` | `V4` | external approval surfaces are clearer without behavior changes | `R3` | blocked and needs-human-review | Approval boundaries become clearer without weaker gates. |
| `#186` | execute/ui | medium | `#185` | `C3` | `V3` | one mission, one visible state, one next move | `R2` | blocked | Execute feels like focus support, not a status console. |
| `#187` | review/ui | medium | `#186` | `C3` | `V3` | carry-forward decisions come before metrics and detail | `R2` | blocked | Review can be completed quickly without scanning noise. |
| `#188` | health/ui | medium | `#187` | `C5` | `V3` | Health becomes the diagnostic home and repair surface | `R3` | blocked | Primary workflow routes can offload system/developer detail safely. |
| `#189` | areas/ui | medium | `#188` | `C3` | `V3` | Areas reads as a quiet admin registry while preserving first-class area truth | `R2` | blocked | Areas becomes clearly secondary to the workflow loop. |

### Phase 8: Final visual system

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#190` | visual-system/ui | medium | `#189` | `C6` | `V3` | nested card depth and surface variants are reduced after hierarchy is fixed | `R2` | blocked | UI feels less boxed in without flattening route identity. |
| `#191` | visual-system/ui | medium | `#190` | `C6` | `V3` | typography, spacing, density, and dark-mode readability tighten up | `R2` | blocked | Screens become calmer and more readable across viewports. |
| `#192` | visual-system/ui | medium | `#191` | `C6` | `V3` | borders, gradients, shadows, and accent use are restrained | `R2` | blocked | Visual noise drops after structure is already simplified. |
| `#193` | visual-system/ui | medium | `#192` | `C6` | `V3` | mobile tap targets and control density normalize | `R2` | blocked | Core controls remain comfortable at mobile widths. |

### Phase 9: Accessibility, motion, performance, evidence

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#194` | accessibility/ui | medium | `#193` | `C6` | `V3` | contrast, focus, target size, keyboard reachability, and status semantics pass | `R2` | blocked | Main workflow routes meet the documented accessibility baseline. |
| `#195` | ui | low | `#194` | `C6` | `V3` | motion is restrained and reduced-motion-friendly | `R2` | blocked | Motion supports clarity rather than spectacle. |
| `#196` | performance/ui | medium | `#195` | `C6` | `V3` | perceived speed and stability remain good after simplification | `R2` | blocked | Capture stays quickly usable and layout jumps do not regress. |
| `#197` | docs/ui | low | `#196` | `C2` | `V0` | required screenshot evidence packet format is documented and used | `R0` | blocked | UI PR evidence is standardized before the final audit. |

### Phase 10: Final audit and closeout

| Issue | Type | Risk | Deps | Read | Validation | Proof | Rollback | Ready state | Acceptance focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#198` | audit | high | `#197`, `#202` | `C6` | `V5` | screenshots, tests, runtime behavior, and docs agree route by route under `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md` | `R4` | blocked and needs-human-review | No route scores `0`, average is at least `2.4`, and Capture/Home each average at least `2.7`. |
| `#199` | docs/audit | high | `#198` | `C2` | `V0` | roadmap and handoff docs record shipped truth only | `R4` | blocked and needs-human-review | Close the roadmap only after the audit passes. |

## Notes for later GitHub backfill

- If GitHub write auth is restored, add this file to the parent epic and `#200` as the shared context reference instead of duplicating its fields into fifty-plus bodies.
- When labels and readiness metadata are applied in `#201`, use the `Ready state` column above as the starting state, not the final state after implementation.
