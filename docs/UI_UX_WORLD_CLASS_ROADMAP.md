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

| Outcome                              | Status    | Current evidence                                                                                                          | Current gap                                                                                                                        |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Stronger visual authorship and craft | `active`  | Shared shell polish, premium-feel passes, and stronger route headers are shipped.                                         | The visual system is still more implicit than explicit. Surface taxonomy and accent rules need to be codified and reduced further. |
| Less explanation-by-default          | `active`  | June 3-5 declutter and correction passes removed duplicate empty-state guidance and moved more detail behind disclosures. | Several routes still carry too many lower-page support reveals and too much parallel explanation once expanded.                    |
| Calmer, more effortless shell        | `planned` | The shell is materially calmer and Home no longer carries shell mutation.                                                 | The shell still consumes more attention than a fully invisible frame on action-heavy routes.                                       |
| Sharper interaction feel and closure | `planned` | Inline closure feedback now exists across Capture, Triage, Planning, Execute, and Review.                                 | The cadence is not yet tight enough or visually consistent enough to feel like one authored system.                                |
| More memorable route identity        | `planned` | Home, Execute, Triage, Capture, and Planning now have clearer editorial framing.                                          | Distinction is still uneven. Several routes still read as strong variants of one template instead of unmistakable scenes.          |

## Route scorecard

Use this as a review checklist, not as permission to skip browser proof. Counts below are current contract-level expectations as of `2026-06-05`, grounded in shipped notes and route source, and should be re-counted during future browser passes when a route changes materially.

| Route    | Editorial identity        | Primary CTA count at rest | Disclosure count at rest | Read-only or mutating | 390px first-screen scan | Closure feedback explicit | Distinct identity now | Main remaining gap                                                                                                                  |
| -------- | ------------------------- | ------------------------- | ------------------------ | --------------------- | ----------------------- | ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Home     | Instrument panel          | `1`                       | `3`                      | `read-only`           | `acceptable`            | `n/a`                     | `strong`              | Still needs an even more authored flagship surface taxonomy so support cards feel intentionally secondary instead of merely hidden. |
| Capture  | Raw-first intake          | `1`                       | `3`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | The writing surface now wins, but lower-page helper/history surfaces still carry more disclosure weight than ideal.                 |
| Triage   | One decision at a time    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | Expanded current-item state still exposes too many secondary reveals once the user is inside the card.                              |
| Planning | Local-first scheduling    | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | The route is clearer, but proposal/admin/disclosure density still needs a stricter authored hierarchy.                              |
| Execute  | One mission               | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `strong`              | Mission-first hierarchy is real, but shell/support burden still competes more than it should in longer states.                      |
| Review   | Closure and carry-forward | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | Closure-first is landed, but history/detail sections still feel heavier than a world-class closing loop.                            |
| Health   | Trust before diagnostics  | `1`                       | `1`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | Trust framing is honest, but healthy/degraded surfaces still need a more unmistakable visual center of gravity.                     |
| Areas    | Quiet ownership admin     | `1`                       | `4`                      | `mutating`            | `acceptable`            | `yes`                     | `medium`              | Admin and destructive depth are quieter now, but the route still needs a cleaner authored admin pattern below the top summary.      |

## Ordered pass queue

| Pass                                             | Status    | Intent                                                                                                      | Acceptance gate                                                                                                                                                                                                                  | Required proof                                                                                 |
| ------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `0. Durable planning spine`                      | `done`    | Install one canonical roadmap, route fresh agents through it, and stop reconstructing UX history from chat. | Roadmap exists, `ui` context points to roadmap -> `PROJECT_STATE` -> latest proof note, and docs ownership rules are explicit.                                                                                                   | `pnpm agent:context ui`, formatting check, diff check                                          |
| `1. Finish the not-embarrassing gate everywhere` | `done`    | Remove remaining cognitive-overload regressions and keep one dominant path per route.                       | No route shows two competing primary CTAs at first render, duplicate empty-state explainers stay gone, repeated area/save truth stays demoted, and narrow-screen first scan is materially shorter than the pre-program baseline. | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, `interaction-feedback`            |
| `2. Build a real visual authorship system`       | `active`  | Turn the already-shipped premium passes into an explicit, reduced, shared visual language.                  | Card variants are reduced to a small explicit set, headers feel like one family, accent use is selective, and every screen has one clear visual center of gravity.                                                               | Full repo bar plus `workflow-card-accent` and `execute-focus-flagship`                         |
| `3. Remove explanation-by-default`               | `planned` | Cut residual helper copy and disclosure sprawl that still survives below the fold.                          | Default visible word count drops route-by-route, no route needs three stacked explanation blocks to make sense, and route purpose is legible in one sentence from the UI alone.                                                  | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, targeted route tests              |
| `4. Make the shell feel invisible`               | `planned` | Reduce shell burden so route-local action clearly outranks chrome on every primary screen.                  | 390px shell height drops again, keyboard flow stays intact, and shell surfaces never outrank route-local action on Capture, Planning, Execute, or Review.                                                                        | Full repo bar plus `p0-ux-regression`, `workflow-hierarchy`, focused shell/browser checks      |
| `5. Add interaction feel and closure`            | `planned` | Tighten motion, feedback cadence, and action-near confirmation so the app stops feeling merely correct.     | Every primary action has local closure feedback, no action leaves state change ambiguous, and feedback rhythm reads as one system.                                                                                               | Full repo bar plus `interaction-feedback` and focused route tests                              |
| `6. Give each route a memorable identity`        | `planned` | Make the routes feel like one product without flattening them into one generic template.                    | Screens are distinguishable at a glance, route purpose is legible without reading every label, and the product feels composed rather than templated.                                                                             | Full repo bar plus screenshot/browser review, `workflow-card-accent`, `execute-focus-flagship` |

## Pass notes

### Pass 1 notes

This gate is treated as done because the May 27 through June 5 shipped batches already closed the earlier clarity, empty-state, shell, and route-level overload regressions. Do not reopen it casually. If a future change reintroduces duplicate primary CTAs, duplicate empty-state explainers, or Home mutation on `/`, fix that regression first before claiming progress on later passes.

### Pass 2 notes

This is the active pass because the product is no longer embarrassing, but it is not yet world-class. The current UI has many good local decisions and strong proof, but the authored visual system still lives too much in code and recent notes instead of one compact contract future agents can apply consistently.

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

### Pass 2A: Codify the visual authorship system

This is the next pass a fresh agent should execute.

Why this pass first:

- The product already removed most obvious route-level embarrassment.
- Recent work improved hierarchy and copy, but the visual system is still too implicit.
- Without an explicit authorship pass, later copy/shell/motion work will drift into inconsistent local cleanup.

Scope:

- shared shell and page primitives first
- flagship routes second
- no schema, auth, parser, persistence, or Google write changes

Priority files:

- `apps/web/src/app/globals.css`
- `apps/web/src/app/components/AppShell.tsx`
- `apps/web/src/app/components/WorkflowPageHeader.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/execute/page.tsx`
- if needed after those are stable: `apps/web/src/app/review/page.tsx`, `apps/web/src/app/health/page.tsx`, `apps/web/src/app/settings/areas/page.tsx`

Acceptance criteria:

- define and use a small explicit card taxonomy for flagship, primary workflow, support, disclosure, and admin surfaces
- reduce equal-weight outlined panels
- make accent use selective and purposeful instead of decorative
- keep Home read-only and keep Execute mission-first
- preserve existing route truthfulness, approval gates, and mock/persisted honesty

Proof:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts tests/e2e/interaction-feedback.spec.ts tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts`
