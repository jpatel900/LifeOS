# UI/UX World-Class Roadmap

This file is the canonical long-lived UX program for LifeOS.

- `docs/PROJECT_STATE.md` is shipped truth and current status.
- This roadmap is future intent, active UX program state, and proof routing.
- `docs/implementation-notes/*.md` are historical proof.
- If this roadmap disagrees with runtime, tests, or `PROJECT_STATE`, runtime/tests/`PROJECT_STATE` win.
- Every UX pass must update all three surfaces:
  - roadmap status row
  - `PROJECT_STATE` summary bullet
  - dated implementation note

## Fresh-run protocol

Every fresh UI/UX run should begin with:

1. `AGENTS.md`
2. `docs/agent/CONTEXT_INDEX.md` or `pnpm agent:context ui`
3. `docs/UI_UX_WORLD_CLASS_ROADMAP.md`
4. `docs/PROJECT_STATE.md`
5. the latest linked implementation note for the active roadmap pass
6. the proof surfaces named in that roadmap pass

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

| Outcome                              | Status    | Current evidence                                                                                                                         | Current gap                                                                                                                                                        |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stronger visual authorship and craft | `done`    | Shared shell polish, premium-feel passes, and the explicit flagship/support/admin taxonomy now cover shell and all eight primary routes. | Future visual work should stay inside this authored system. The larger remaining gaps are now copy density, shell burden, interaction cadence, and route identity. |
| Less explanation-by-default          | `active`  | June 3-5 declutter and correction passes removed duplicate empty-state guidance and moved more detail behind disclosures.                | Several routes still carry too many lower-page support reveals and too much parallel explanation once expanded.                                                    |
| Calmer, more effortless shell        | `planned` | The shell is materially calmer and Home no longer carries shell mutation.                                                                | The shell still consumes more attention than a fully invisible frame on action-heavy routes.                                                                       |
| Sharper interaction feel and closure | `planned` | Inline closure feedback now exists across Capture, Triage, Planning, Execute, and Review.                                                | The cadence is not yet tight enough or visually consistent enough to feel like one authored system.                                                                |
| More memorable route identity        | `planned` | Home, Execute, Triage, Capture, and Planning now have clearer editorial framing.                                                         | Distinction is still uneven. Several routes still read as strong variants of one template instead of unmistakable scenes.                                          |

## Route scorecard

Use this as a review checklist, not as permission to skip browser proof. Counts below are current contract-level expectations as of `2026-06-05`, grounded in shipped notes and route source, and should be re-counted during future browser passes when a route changes materially.

| Route    | Editorial identity        | Primary CTA count at rest | Disclosure count at rest | Read-only or mutating | 390px first-screen scan | Closure feedback explicit | Distinct identity now | Main remaining gap                                                                                                                                           |
| -------- | ------------------------- | ------------------------- | ------------------------ | --------------------- | ----------------------- | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home     | Instrument panel          | `1`                       | `3`                      | `read-only`           | `acceptable`            | `n/a`                     | `strong`              | Still needs an even more authored flagship surface taxonomy so support cards feel intentionally secondary instead of merely hidden.                          |
| Capture  | Raw-first intake          | `1`                       | `3`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | The flagship writing surface is now clear, but saved-history and device-only helper copy still need a stricter copy budget in Pass 3.                        |
| Triage   | One decision at a time    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | The current-item hierarchy is now clear, but context and browser-note disclosures still carry too much explanation once opened.                              |
| Planning | Local-first scheduling    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | The flagship planning flow is now clear, but proposal and Google/admin detail still carry too much explanatory copy once expanded.                           |
| Execute  | One mission               | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Mission-first hierarchy is real, but shell/support burden still competes more than it should in longer states.                                               |
| Review   | Closure and carry-forward | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | The route now has a real closure-first flagship and calmer admin/history surfaces, but below-the-fold copy/disclosure weight still needs trimming in Pass 3. |
| Health   | Trust before diagnostics  | `1`                       | `1`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Visual center of gravity is now clearer, but interaction cadence between healthy, warning, and failure states still needs a tighter shared standard.         |
| Areas    | Quiet ownership admin     | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | The flagship create-area surface and quieter admin cards are landed, but the route still carries more expanded admin depth than ideal.                       |

## Ordered pass queue

| Pass                                             | Status    | Intent                                                                                                      | Acceptance gate                                                                                                                                                                                                                  | Required proof                                                                                 |
| ------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0. Durable planning spine`                      | `done`    | Install one canonical roadmap, route fresh agents through it, and stop reconstructing UX history from chat. | Roadmap exists, `ui` context points to roadmap -> `PROJECT_STATE` -> latest proof note, and docs ownership rules are explicit.                                                                                                   | `pnpm agent:context ui`, formatting check, diff check                                          |
| `1. Finish the not-embarrassing gate everywhere` | `done`    | Remove remaining cognitive-overload regressions and keep one dominant path per route.                       | No route shows two competing primary CTAs at first render, duplicate empty-state explainers stay gone, repeated area/save truth stays demoted, and narrow-screen first scan is materially shorter than the pre-program baseline. | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, `interaction-feedback`            |
| `2. Build a real visual authorship system`       | `done`    | Turn the already-shipped premium passes into an explicit, reduced, shared visual language.                  | Card variants are reduced to a small explicit set, headers feel like one family, accent use is selective, and every screen has one clear visual center of gravity.                                                               | Full repo bar plus `workflow-card-accent` and `execute-focus-flagship`                         |
| `3. Remove explanation-by-default`               | `active`  | Cut residual helper copy and disclosure sprawl that still survives below the fold.                          | Default visible word count drops route-by-route, no route needs three stacked explanation blocks to make sense, and route purpose is legible in one sentence from the UI alone.                                                  | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, targeted route tests              |
| `4. Make the shell feel invisible`               | `planned` | Reduce shell burden so route-local action clearly outranks chrome on every primary screen.                  | 390px shell height drops again, keyboard flow stays intact, and shell surfaces never outrank route-local action on Capture, Planning, Execute, or Review.                                                                        | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, focused shell/browser checks      |
| `5. Add interaction feel and closure`            | `planned` | Tighten motion, feedback cadence, and action-near confirmation so the app stops feeling merely correct.     | Every primary action has local closure feedback, no action leaves state change ambiguous, and feedback rhythm reads as one system.                                                                                               | Full repo bar plus `interaction-feedback` and focused route tests                              |
| `6. Give each route a memorable identity`        | `planned` | Make the routes feel like one product without flattening them into one generic template.                    | Screens are distinguishable at a glance, route purpose is legible without reading every label, and the product feels composed rather than templated.                                                                             | Full repo bar plus screenshot/browser review, `workflow-card-accent`, `execute-focus-flagship` |

## Pass notes

### Pass 1 notes

This gate is treated as done because the May 27 through June 5 shipped batches already closed the earlier clarity, empty-state, shell, and route-level overload regressions. Do not reopen it casually. If a future change reintroduces duplicate primary CTAs, duplicate empty-state explainers, or Home mutation on `/`, fix that regression first before claiming progress on later passes.

### Pass 2 notes

This pass is now complete enough to treat the explicit authored surface system as shipped contract rather than ongoing experiment. Future route work should reuse this vocabulary instead of inventing new near-duplicate card or header patterns.

Latest landed slice:

- `2026-06-05`: shared surface taxonomy is now explicit in code instead of implied only by local route tweaks. `globals.css`, `WorkflowPageHeader`, `AppShell`, Home, and Execute now distinguish flagship, support, admin, and shell-context surfaces more intentionally while preserving read-only Home, mission-first Execute, and existing truth boundaries. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`.
- `2026-06-05`: the same authored surface taxonomy now extends into Review, Health, and Areas instead of stopping at Home and Execute. Review now uses one closure-first flagship plus quieter support/admin disclosures, Health now keeps reliability as the only flagship with support/admin diagnostics demoted appropriately, and Areas now distinguishes flagship creation, support summaries, and quieter admin/reset surfaces without changing route truthfulness or any schema/auth/parser/calendar/persistence boundary. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, `pnpm --filter @lifeos/web test -- src/__tests__/healthPage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/execute-focus-flagship.spec.ts`.
- `2026-06-05`: Capture, Planning, and Triage now complete the same authored surface contract instead of keeping route-local hierarchy drift. Capture now uses a true flagship writing surface plus quieter support/admin history flows, Planning now treats `Planning flow` as the single flagship with task/proposal/block surfaces demoted appropriately, and Triage now keeps the current item as the only flagship while queue/context/browser-note surfaces stay clearly secondary. Proof: `pnpm lint`, `pnpm build`, rerun `pnpm type-check` after the known `.next/types` race, `pnpm test`, `pnpm --filter @lifeos/web test -- src/__tests__/capture.test.tsx src/__tests__/triage.test.tsx src/__tests__/workflowAreaAccent.test.tsx src/__tests__/phase4aPersistence.test.tsx src/__tests__/sourceOfTruth.test.ts`, and `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/execute-focus-flagship.spec.ts`.

### Pass 3-6 notes

These later passes are not greenfield. June work already moved them forward. Keep them ordered anyway so future runs do not thrash between copy trimming, shell compression, motion, and route-identity experiments without one active gate.

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

- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-home-execute.md`
- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-review-health-areas.md`
- `docs/implementation-notes/2026-06-05-visual-authorship-taxonomy-capture-planning-triage.md`
- `docs/implementation-notes/2026-06-05-home-review-areas-shell-polish-pass.md`
- `docs/implementation-notes/2026-06-04-home-execute-ia-reduction-pass.md`
- `docs/implementation-notes/2026-06-04-capture-planning-premium-feel-pass.md`
- `docs/implementation-notes/2026-06-04-triage-premium-feel-pass.md`
- `docs/implementation-notes/2026-06-03-shared-shell-polish-pass.md`
- `docs/implementation-notes/2026-06-02-ux-ia-and-scope-decisions.md`

Historical inputs only, not active program state:

- `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md`
- `docs/ux/LIFEOS_V1_UX_SCORECARD.md`

## Next recommended pass

### Pass 3A: Remove explanation-by-default from Capture, Planning, and Triage

This is the next pass a fresh agent should execute.

Why this pass first:

- The authored surface system is now explicit across all primary routes, so more hierarchy work would mostly churn.
- The next obvious gap is visible word count and repeated helper/disclosure copy, especially on Capture, Planning, and Triage where opened details still explain too much.
- These three routes now have stable visual centers of gravity, which makes copy reduction safer and easier to verify.

Scope:

- reduce repeated helper and disclosure copy above and just below the fold
- keep one purpose sentence, one dominant CTA, and one secondary truth/disclosure label per route
- move duplicative explanation into existing disclosures or delete it
- no schema, auth, parser, persistence, or Google write changes

Priority files:

- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/calendar/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- shared tests and proof only as needed

Acceptance criteria:

- default visible word count drops on all three touched routes
- no route depends on stacked explanation blocks to explain the main action
- parser/save/local-first/approval truth stays explicit once instead of repeated in parallel
- route purpose is understandable in one sentence from the UI alone
- existing route truthfulness, approval gates, and mock/persisted honesty stay intact

Proof:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts`
