# Visual authorship taxonomy for shell, Home, and Execute

## Task name and branch

- Task: Pass 2A visual authorship system, first implementation slice
- Branch: current working branch

## Original scope

- codify the authored surface taxonomy in shared UI styles instead of leaving it implicit
- apply the new taxonomy first to shared shell/context primitives, then to Home and Execute
- preserve all existing LifeOS truthfulness and workflow boundaries

## Assumptions

- The current product already cleared the earlier "not embarrassing" gate and did not need another large IA rewrite.
- The highest-value next move was explicit systemization, not more route-specific copy pruning.
- `impeccable` was used only as bounded design guidance. Its `PRODUCT.md` init flow was rejected because it would create a parallel context system outside LifeOS authority docs.

## Decisions

- Added an explicit shared surface taxonomy in `globals.css`:
  - `workflow-flagship-card`
  - `workflow-support-card`
  - `workflow-admin-card`
  - `workflow-shell-panel`
- Extended `WorkflowPageHeader` so shell and route contexts can apply explicit spotlight/body variants instead of one fixed wrapper.
- Moved Home's `Today / Next` panel onto the flagship surface and its support panels onto the support surface.
- Moved Execute's current mission onto the flagship surface and aligned its focus-state / cleanup surfaces with the same authored support treatment.
- Kept Home read-only, kept Execute mission-first, and left all persistence/auth/parser/calendar behavior unchanged.

## Deviations

- Did not adopt `impeccable`'s `context.mjs`-driven `PRODUCT.md` init flow after it reported `NO_PRODUCT_MD`. That workflow is lower-trust than `AGENTS.md` and would have introduced parallel planning context mid-pass.
- Did not spread the taxonomy across every remaining route in this slice. That would have been scope creep. Review/Health/Areas are the next continuation.

## Tradeoffs

- This slice optimizes for coherent system primitives over dramatic route-level restyling. That is the safer product move for LifeOS.
- The taxonomy is intentionally small. Adding five more named card families now would just recreate the earlier ambiguity with fancier names.

## Files changed and why

- `apps/web/src/app/globals.css`
  - added explicit flagship/support/admin/shell surface classes and strengthened shared support-panel styling
- `apps/web/src/app/components/WorkflowPageHeader.tsx`
  - added optional spotlight/body class hooks for authored context variants
- `apps/web/src/app/components/AppShell.tsx`
  - aligned shell chrome and shell-context surfaces with the shared taxonomy
- `apps/web/src/app/page.tsx`
  - moved Home's main surface onto the flagship treatment and support cards onto the authored support treatment
- `apps/web/src/app/execute/page.tsx`
  - moved Execute mission/support surfaces onto the authored taxonomy
- `apps/web/src/__tests__/page.test.tsx`
  - locked the new Home flagship treatment and editorial kicker
- `apps/web/src/__tests__/executeFocusPolish.test.tsx`
  - locked the Execute flagship card classification
- `apps/web/src/__tests__/sourceOfTruth.test.ts`
  - locked the presence of the shared authored taxonomy classes

## Validation commands and results

- `pnpm exec prettier --check apps/web/src/app/components/WorkflowPageHeader.tsx apps/web/src/app/components/AppShell.tsx apps/web/src/app/globals.css apps/web/src/app/page.tsx apps/web/src/app/execute/page.tsx apps/web/src/__tests__/page.test.tsx apps/web/src/__tests__/executeFocusPolish.test.tsx apps/web/src/__tests__/sourceOfTruth.test.ts`
  - passed
- `pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/page.test.tsx src/__tests__/executeFocusPolish.test.tsx`
  - passed
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-card-accent.spec.ts tests/e2e/execute-focus-flagship.spec.ts tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts`
  - passed
- `pnpm lint`
  - passed
- `pnpm type-check`
  - first run hit the known transient `.next/types` race (`apps/web/.next/types/app/layout.ts` missing after `next typegen`)
- `pnpm build`
  - passed
- `pnpm type-check`
  - rerun passed immediately post-build
- `pnpm test`
  - passed

## Risks

- Low to medium. The main risk is visual drift on untouched routes if future work stops after Home and Execute and never extends the same taxonomy to Review/Health/Areas.

## Deferred items

- Extend the same authored taxonomy to Review, Health, and Areas next.
- Revisit Capture, Planning, and Triage only after the remaining generic secondary/admin surfaces are reduced.

## Rollback notes

- Revert the shared taxonomy changes in `globals.css`, `WorkflowPageHeader.tsx`, `AppShell.tsx`, `page.tsx`, `execute/page.tsx`, and the three touched tests together.
- Revert `docs/UI_UX_WORLD_CLASS_ROADMAP.md`, `docs/PROJECT_STATE.md`, and this note in the same rollback if the pass history needs to be removed.
