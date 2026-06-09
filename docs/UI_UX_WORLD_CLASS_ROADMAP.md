# UI/UX World-Class Roadmap

Status: Active UI/UX roadmap and proof-routing spine for Pass 7 and later UX work
Purpose: Define the live UX program state, ordered passes, proof routing, and long-lived UX direction
Read when: Starting, implementing, reviewing, or auditing UI/UX work
Do not use for: Shipped product truth or runtime proof by itself
Superseded by: n/a

This file is the canonical long-lived UX program for LifeOS.

- `docs/PROJECT_STATE.md` is shipped truth and current status.
- This roadmap is future intent, active UX program state, and proof routing.
- `docs/implementation-notes/*.md` are historical proof.
- If this roadmap disagrees with runtime, tests, or `PROJECT_STATE`, runtime/tests/`PROJECT_STATE` win.
- Current active program state is Pass 7. Passes 0 through 6 below remain shipped history and guardrails, not the next execution queue.
- Every UX pass must update all three surfaces:
  - roadmap status row
  - `PROJECT_STATE` summary bullet
  - dated implementation note

## Pass 7 reopen note

Passes 0 through 6 shipped real UX gains, but the program is not maintenance-only.

Pass 7 reopens the roadmap for active work on:

- first-scan clarity
- diagnostic staging
- route restraint
- mobile-first hierarchy
- proof-based final audit before closeout

Earlier outcomes can stay marked `done` without implying the UI is finished. Pass 7 exists because clarity, diagnostics staging, and final proof still need active work across docs, tests, shell, and route surfaces.

## Duplicate-plan guardrail

- If the work is still live, amend this roadmap instead of creating a second active UI/UX plan.
- If a plan is no longer live, retire or archive it explicitly before opening a replacement.
- Use `docs/implementation-notes/*.md` for dated proof and bounded completion notes, not for a second active queue.
- Temporary control-plane supplements must link back here and must not present themselves as the active roadmap.

## Fresh-run protocol

Every fresh UI/UX run should begin with:

1. `AGENTS.md`
2. `docs/agent/CONTEXT_INDEX.md` or `pnpm agent:context ui`
3. `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
4. `docs/PROJECT_STATE.md`
5. the latest linked implementation note for the active roadmap pass
6. the proof surfaces named in that roadmap pass

## Frontend system guardrail

For LifeOS frontend work, the target is not "make everything stock shadcn."

- Push shared primitives and common interaction patterns toward app-local shadcn-compatible components in `apps/web/src/components/ui`.
- Reuse or extend the existing token system in `apps/web/src/app/globals.css` before inventing page-local visual treatments.
- Keep `AppShell`, workflow headers, route identity, area accents, and the flagship/support/admin surface system intentionally custom.
- Add or replace primitives only where they improve consistency, accessibility, or repeated usage. Do not churn stable product composition just to increase shadcn coverage.
- Treat this as the stable split going forward: shadcn for the primitive layer and shared patterns, custom code for product-specific composition and authorship.

Current posture:

- The route-level primitive/disclosure/loading cleanup for this rule is complete.
- Future UX passes should treat the shared primitive layer as maintenance infrastructure, not as an active redesign stream.
- Do not reopen primitive work unless a repeated seam, accessibility gap, or consistency problem is real and current.

Latest supporting proof:

- `2026-06-06`: the current route-level implementation pass of this guardrail is complete. The app now has shared app-local `Label` and `Skeleton` primitives, `WorkflowLoadingState` uses the shared skeleton system, `DiagnosticsDisclosure` is the standard wrapper for repeated system-details flows, `/login` now uses the same authored card/form system as the rest of the app instead of raw inline-styled markup, and repeated label/disclosure/loading seams across Home, Capture, Triage, Planning, Execute, Review, Health, Areas, and Google Calendar settings now route through the shared primitive layer without flattening route identity. Proof: `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

## Program north star

Use the hybrid model:

- world-class outcomes are the north star
- the route-level audit blockers stay the concrete implementation gate

The five target outcomes are:

1. stronger visual authorship and craft
2. less explanation-by-default
3. a calmer, more effortless shell
4. sharper interaction feel and closure
5. more memorable route identity

## Outcome status

| Outcome                              | Status    | Current evidence                                                                                                                                                                   | Current gap                                                                                                                                                        |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stronger visual authorship and craft | `done`    | Shared shell polish, premium-feel passes, and the explicit flagship/support/admin taxonomy now cover shell and all eight primary routes.                                           | Pass 7 should protect this authored system while reducing clutter, staging diagnostics later, and avoiding broad restyling churn.                                  |
| Less explanation-by-default          | `done`    | June 3-6 declutter passes removed duplicate empty-state guidance and tightened copy budgets across Capture, Planning, Triage, Review, and Areas without changing truth boundaries. | Pass 7 now focuses on first-scan clarity and diagnostic staging, not another generic helper-copy trimming spree.                                                    |
| Calmer, more effortless shell        | `done`    | The shell is materially calmer, Home no longer carries shell mutation, and Capture/Planning/Execute/Review now suppress the extra shell-context band so route-local action wins faster. | Pass 7 must verify shell restraint under mobile first-viewport pressure and keep route-local action dominant.                                                       |
| Sharper interaction feel and closure | `done`    | Authored action-near feedback now exists across Capture, Triage, Planning, Execute, Review, Health, and Areas, and the primary workflow routes now share one tighter cadence system instead of mixing old flat status lines with newer authored alerts. | Pass 7 must now tighten degraded-state language, diagnostics-before-action sequencing, and proof rather than reopen broad interaction styling.                      |
| More memorable route identity        | `done`    | Home, Execute, Triage, Capture, Planning, Review, Health, and Areas now have route-specific editorial framing strong enough that the product reads as composed rather than templated. | Pass 7 must preserve route identity while simplifying support surfaces and moving heavier diagnostics into the right home.                                          |

## Route scorecard

Use this as a review checklist, not as permission to skip browser proof. Counts below are current contract-level expectations as of `2026-06-05`, grounded in shipped notes and route source, and should be re-counted during future browser passes when a route changes materially.

| Route    | Editorial identity        | Primary CTA count at rest | Disclosure count at rest | Read-only or mutating | 390px first-screen scan | Closure feedback explicit | Distinct identity now | Main remaining gap                                                                                                                                            |
| -------- | ------------------------- | ------------------------- | ------------------------ | --------------------- | ----------------------- | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home     | Instrument panel          | `1`                       | `3`                      | `read-only`           | `acceptable`            | `n/a`                     | `strong`              | Pass 7 must keep Home as a launchpad, calm degraded states down, and reduce support clutter without breaking read-only truth.                                   |
| Capture  | Raw-first intake          | `1`                       | `3`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must keep raw input and the primary save action dominant while pushing metrics, history, and diagnostics later.                                          |
| Triage   | One decision at a time    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must keep one current decision visually primary and demote support context, system detail, and queue noise further.                                      |
| Planning | Local-first scheduling    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must separate local planning flow, external approval staging, and deeper diagnostics more cleanly.                                                       |
| Execute  | Mission room              | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must keep one mission, one visible state, and one next move dominant while staging support detail later.                                                 |
| Review   | Carry-forward desk        | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must keep carry-forward decisions ahead of metrics, historical detail, and lower-value support copy.                                                     |
| Health   | Trust-and-repair desk     | `1`                       | `1`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must make Health the clear diagnostic home so the other workflow routes can stay calmer.                                                                 |
| Areas    | Quiet ownership registry  | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Pass 7 must keep Areas clearly secondary and admin-oriented in the overall workflow hierarchy.                                                                   |

## Ordered pass queue

| Pass                                             | Status    | Intent                                                                                                      | Acceptance gate                                                                                                                                                                                                                  | Required proof                                                                                 |
| ------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0. Durable planning spine`                      | `done`    | Install one canonical roadmap, route fresh agents through it, and stop reconstructing UX history from chat. | Roadmap exists, `ui` context points to roadmap -> `PROJECT_STATE` -> latest proof note, and docs ownership rules are explicit.                                                                                                   | `pnpm agent:context ui`, formatting check, diff check                                          |
| `1. Finish the not-embarrassing gate everywhere` | `done`    | Remove remaining cognitive-overload regressions and keep one dominant path per route.                       | No route shows two competing primary CTAs at first render, duplicate empty-state explainers stay gone, repeated area/save truth stays demoted, and narrow-screen first scan is materially shorter than the pre-program baseline. | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, `interaction-feedback`            |
| `2. Build a real visual authorship system`       | `done`    | Turn the already-shipped premium passes into an explicit, reduced, shared visual language.                  | Card variants are reduced to a small explicit set, headers feel like one family, accent use is selective, and every screen has one clear visual center of gravity.                                                               | Full repo bar plus `workflow-card-accent` and `execute-focus-flagship`                         |
| `3. Remove explanation-by-default`               | `done`    | Cut residual helper copy and disclosure sprawl that still survives below the fold.                          | Default visible word count drops route-by-route, no route needs three stacked explanation blocks to make sense, and route purpose is legible in one sentence from the UI alone.                                                  | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, targeted route tests              |
| `4. Make the shell feel invisible`               | `done`    | Reduce shell burden so route-local action clearly outranks chrome on every primary screen.                  | 390px shell height drops again, keyboard flow stays intact, and shell surfaces never outrank route-local action on Capture, Planning, Execute, or Review.                                                                        | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, focused shell/browser checks      |
| `5. Add interaction feel and closure`            | `done`    | Tighten motion, feedback cadence, and action-near confirmation so the app stops feeling merely correct.     | Every primary action has local closure feedback, no action leaves state change ambiguous, and feedback rhythm reads as one system.                                                                                               | Full repo bar plus `interaction-feedback` and focused route tests                              |
| `6. Give each route a memorable identity`        | `done`    | Make the routes feel like one product without flattening them into one generic template.                    | Screens are distinguishable at a glance, route purpose is legible without reading every label, and the product feels composed rather than templated.                                                                             | Full repo bar plus screenshot/browser review, `workflow-card-accent`, `execute-focus-flagship` |
| `7. Recover clarity and diagnostic staging`      | `active`  | Reassert one active roadmap, tighten first-scan discipline, stage diagnostics after action, and require proof-based final audit before closeout. | Pass 7 docs, setup, tests, and shared-rule gates finish before route implementation, older plan docs are explicitly historical, the information hierarchy doctrine routes user/safety/diagnostic/developer truth intentionally, UI review expectations require behavior/tests/screenshot proof before completion claims, and final route audit uses the canonical Pass 7 rubric rather than ad hoc review notes.          | `docs/agent/UI_UX_DOC_INVENTORY.md`, `docs/agent/UI_PASS_7_EXECUTION_MAP.md`, `docs/agent/UI_INFORMATION_HIERARCHY_DOCTRINE.md`, `docs/agent/UI_AGENT_GUIDE.md`, `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`, plus later route-proof gates |

## Pass notes

### Pass 1 notes

This gate is treated as done because the May 27 through June 5 shipped batches already closed the earlier clarity, empty-state, shell, and route-level overload regressions. Do not reopen it casually. If a future change reintroduces duplicate primary CTAs, duplicate empty-state explainers, or Home mutation on `/`, fix that regression first before claiming progress on later passes.

### Pass 2 notes

This pass is now complete enough to treat the explicit authored surface system as shipped contract rather than ongoing experiment. Future route work should reuse this vocabulary instead of inventing new near-duplicate card or header patterns.

Latest landed slice:

- `2026-06-05`: shared surface taxonomy is now explicit in code instead of implied only by local route tweaks. `globals.css`, `WorkflowPageHeader`, `AppShell`, Home, and Execute now distinguish flagship, support, admin, and shell-context surfaces more intentionally while preserving read-only Home, mission-first Execute, and existing truth boundaries. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`.
- `2026-06-05`: the same authored surface taxonomy now extends into Review, Health, and Areas instead of stopping at Home and Execute. Review now uses one closure-first flagship plus quieter support/admin disclosures, Health now keeps reliability as the only flagship with support/admin diagnostics demoted appropriately, and Areas now distinguishes flagship creation, support summaries, and quieter admin/reset surfaces without changing route truthfulness or any schema/auth/parser/calendar/persistence boundary. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/execute-focus-flagship.spec.ts`.
- `2026-06-05`: Capture, Planning, and Triage now complete the same authored surface contract instead of keeping route-local hierarchy drift. Capture now uses a true flagship writing surface plus quieter support/admin history flows, Planning now treats `Planning flow` as the single flagship with task/proposal/block surfaces demoted appropriately, and Triage now keeps the current item as the only flagship while queue/context/browser-note surfaces stay clearly secondary. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/triage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/execute-focus-flagship.spec.ts`.
- `2026-06-06`: Home now closes the last meaningful authored-surface maintenance gap without reopening the UX roadmap. The `Today next` flagship uses explicit Home-only flagship treatment, the most relevant support card is intentionally featured instead of merely co-equal, and overflow support surfaces are deliberately quieter behind progressive disclosure so the instrument-panel read stays authored at first scan. No Next-action logic, read-only boundaries, or cross-route shell rules changed. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/page.test.tsx`, `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, and `pnpm --filter @lifeos/web test`.

### Pass 3-6 notes

These later passes are not greenfield. June work already moved them forward. Keep them ordered anyway so future runs do not thrash between copy trimming, shell compression, motion, and route-identity experiments without one active gate.

Also keep this boundary explicit:

- Passes 3-6 should reuse the current shared primitive layer (`apps/web/src/components/ui`, `WorkflowLoadingState`, `DiagnosticsDisclosure`) instead of inventing route-local replacements.
- Primitive work is no longer a standalone modernization goal. It is now a supporting rule for future UX passes.

Latest Pass 3A slice:

- `2026-06-06`: Capture now carries less explanation-by-default without changing any save/parser truth boundary. The route shortens the main editorial description, compresses the save/area/action helper copy, renames the local draft disclosure to `Local draft pass`, shortens button-adjacent helper text, and removes redundant intro copy above saved/device-only history while keeping the same shared primitive/disclosure layer and the same raw-vs-local-vs-account truth model. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/sourceOfTruth.test.ts`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, rerun `pnpm --filter @lifeos/web type-check` after the known `.next/types` race, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.
- `2026-06-06`: Planning now carries less explanation-by-default without changing any local-first or approval-gated calendar truth. The route shortens the editorial/header copy, compresses the flagship planning-flow guidance, shortens support-card descriptions and the empty-state paragraph, trims the adjust-time helper copy, and compresses the footer safety/next-step wording while keeping the same proposal, Google-write, and shared-primitive structure. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, and `pnpm --filter @lifeos/web test`.
- `2026-06-06`: Triage now completes the current Pass 3A explanation-reduction batch without changing queue semantics, save boundaries, or browser-note honesty. The route shortens the editorial/header copy, compresses the queue/save metric language, tightens the current-focus helper sentence, shortens the current-item and decision helper copy, trims browser-note disclosure wording, and compresses the empty-state and saved-context language while keeping the same current-item hierarchy and shared primitive/disclosure layer. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/triage.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`, `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web build`.

Latest Pass 3B slice:

- `2026-06-06`: Review and Areas now close the current explanation-reduction program without changing persistence, auth, parser, or external-write truth boundaries. Review shortens the editorial/header copy, compresses reflection and close-the-loop helper language, tightens loading and summary wording, and trims lower-page admin/history descriptions. Areas shortens the editorial/header copy, compresses save-mode and active-area helper text, tightens create-area guidance, shortens loading and empty-state wording, and trims area-card/admin accent explanations while keeping reset/remove honesty intact. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/routeSmoke.test.tsx src/__tests__/sourceOfTruth.test.ts`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web build`.

Latest Pass 4A slice:

- `2026-06-06`: Execute and Review now open under quieter shell framing without changing route semantics, keyboard reachability, or truth boundaries. The extra shell-context band is intentionally suppressed on those two routes, the shared shell header drops to a quieter shadow treatment there, and the main support cards on both routes are visually demoted so the mission/closure flagship card wins the first scan faster at desktop and `390px`. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/executeFocusPolish.test.tsx src/__tests__/workflowAreaAccent.test.tsx`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

Latest Pass 4B slice:

- `2026-06-06`: Capture and Planning now complete the current shell-quieting program without changing route semantics, keyboard reachability, parser/save truth, persistence, or Google approval gates. `AppShell` now also suppresses the extra shell-context band on `/capture` and `/calendar`, and each route's top summary spotlight is visually demoted so the raw-intake/planning-flow flagship card wins the first scan faster at desktop and `390px`. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/routeSmoke.test.tsx src/__tests__/capture.test.tsx src/__tests__/workflowAreaAccent.test.tsx`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

Latest Pass 5A slice:

- `2026-06-06`: Capture and Planning now start the interaction-cadence program with tighter action-near feedback and less fragmented status behavior, without changing parser/save truth, persistence, auth, or Google approval gates. Capture now resolves save/organize outcomes to one dominant feedback surface at a time instead of stacking raw-save and parse-success messaging, keeps the raw-capture-stored truth visible when AI sorting fails, and uses the same authored success surface for save, parse, and in-flight organize states. Planning now upgrades in-flight actions from plain muted text to authored status feedback and exposes `Review next suggested time block` immediately after suggestion-oriented updates so the next useful move is visible near the confirmation instead of buried in the page. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/phase4aPersistence.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/interaction-feedback.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

Latest Pass 5B slice:

- `2026-06-06`: Execute and Review now extend the same authored interaction cadence without changing persistence contracts, auth, or route truth boundaries. Execute upgrades its pending and failure states from flat muted/destructive fallbacks into the same authored feedback family as its success states, while keeping the current mission unchanged unless a save actually succeeds. Review upgrades `Creating daily review...` into an authored in-flight surface, promotes the saved state into the same celebration family used elsewhere, and keeps explicit next-step links near the save confirmation so closure and follow-up feel like one system instead of an older exception. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/executeFocusPolish.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/interaction-feedback.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

Latest Pass 5C slice:

- `2026-06-06`: Health and Areas now close the interaction-cadence pass without changing route truth, persistence contracts, auth, parser behavior, or Google write boundaries. Health replaces the flat run-status line with the same authored feedback family used elsewhere, so running, success, and failure states now sit next to the control with explicit next-step guidance instead of reading like an older exception. Areas now does the same for create/remove/accent/reset flows, pushing action feedback back toward the control instead of scattering it across muted inline text and route-footer alerts. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/phase4aPersistence.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

Latest Pass 6A slice:

- `2026-06-06`: Health and Areas now open with stronger route identity without changing truth boundaries, persistence contracts, auth, parser behavior, or Google write rules. Health now reads more unmistakably like a trust-and-repair desk through a distinct header treatment, trust-map support card, and repair-queue framing, while still keeping one flagship answer and the authored run-feedback system from Pass 5C. Areas now reads more unmistakably like a quiet ownership registry through a calmer ownership-boundary header, a current-area ownership summary, quieter single-column area records, and stronger ownership/admin framing around actions and diagnostics, while still keeping save-local truth and action-near feedback intact. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx`, `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`, `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`.

Latest Pass 6B slice:

- `2026-06-06`: Execute and Review now complete the route-identity pass without changing truth boundaries, persistence contracts, auth, parser behavior, or Google write rules. Execute now reads more unmistakably like a mission room through a distinct route brief, stronger mission-card framing, and more route-specific mission-state / lane-protection language, while keeping the same quiet shell and authored feedback system from Pass 4A and Pass 5B. Review now reads more unmistakably like a carry-forward desk through a distinct closure header, a stronger closure flagship with carry-forward metrics, and clearer carry-forward framing across reflections, action routing, and the daily board, while keeping the same closure-first hierarchy and authored save feedback. Proof: `pnpm --filter @lifeos/web test -- src/__tests__/executeFocusPolish.test.tsx`, `pnpm --filter @lifeos/web test -- src/__tests__/workflowAreaAccent.test.tsx`, `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts`, `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`, `pnpm --filter @lifeos/web lint`, `pnpm --filter @lifeos/web build`, `pnpm --filter @lifeos/web type-check`, `pnpm --filter @lifeos/web test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`.

## Proof contract for UX passes

Default UX-pass gate:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`

Mandatory browser suites for route or shell work:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`

Keep or expand these when the pass changes premium-feel, flagship hierarchy, or accent behavior:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`

Add these when area-accent behavior itself changes:

- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/app-shell-accent.spec.ts tests/e2e/areas-color-edit.spec.ts`

## Most relevant shipped proof

- `docs/implementation-notes/2026-06-06-pass-3a-capture-explanation-reduction.md`
- `docs/implementation-notes/2026-06-06-pass-3a-planning-explanation-reduction.md`
- `docs/implementation-notes/2026-06-06-pass-3a-triage-explanation-reduction.md`
- `docs/implementation-notes/2026-06-06-pass-3b-review-areas-explanation-reduction.md`
- `docs/implementation-notes/2026-06-06-pass-4a-execute-review-shell-quieting.md`
- `docs/implementation-notes/2026-06-06-pass-6a-health-areas-route-identity.md`
- `docs/implementation-notes/2026-06-06-pass-6b-execute-review-route-identity.md`
- `docs/implementation-notes/2026-06-06-home-cockpit-flagship-taxonomy-maintenance.md`
- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-home-execute.md`
- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-review-health-areas.md`
- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-capture-planning-triage.md`
- `docs/implementation-notes/2026-06-06-ui-ux-plan-shadcn-alignment.md`
- `docs/implementation-notes/2026-06-06-frontend-shadcn-governance.md`
- `docs/implementation-notes/2026-06-06-shadcn-consistency-plan-completion.md`
- `docs/implementation-notes/2026-06-06-shadcn-primitive-consistency-pass.md`
- `docs/implementation-notes/2026-06-05-home-review-areas-shell-polish-pass.md`
- `docs/implementation-notes/2026-06-04-home-execute-ia-reduction-pass.md`
- `docs/implementation-notes/2026-06-04-capture-planning-premium-feel-pass.md`
- `docs/implementation-notes/2026-06-04-triage-premium-feel-pass.md`
- `docs/implementation-notes/2026-06-03-shared-shell-polish-pass.md`
- `docs/implementation-notes/2026-06-02-ux-ia-and-scope-decisions.md`

Historical inputs only, not active program state:

- `docs/archive/ui-ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`
- `docs/archive/ui-ux/LIFEOS_V1_UX_SCORECARD.md`
- `docs/archive/ui-ux/2026-06-03-lifeos-ui-ux-modernization-design.md`
- `docs/archive/ui-ux/2026-06-03-lifeos-ui-ux-modernization-implementation.md`

## Next recommended pass

### Active implementation pass: 7

The current UX roadmap is not maintenance-only anymore. Pass 7 is the active UI/UX program.

What a fresh agent should do next:

- finish docs hygiene first so the roadmap is unquestionably singular
- complete the review/setup and tests/shared-rules gates before route implementation
- treat Passes 0 through 6 as shipped history and maintenance guardrails, not the active queue
- do not start route work until issues `#147` through `#168` and `#200` through `#202` are complete

Default proof while Pass 7 is active:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`
