## 2026-06-03 Review, Health, and Areas premium polish pass

### Why

The critical-path workflow screens were already honest and stable, but the quieter supporting surfaces still felt too much like utility software. `Review`, `Health`, and `Areas` needed a more intentional product feel without reopening route semantics, persistence rules, or approval boundaries.

### What changed

- Added shared premium-support primitives in `apps/web/src/app/globals.css`:
  - `workflow-metric-grid`
  - `workflow-metric-card`
  - `workflow-action-tray`
  - `workflow-section-kicker`
- `Review` now presents reflection prompts and close-the-loop actions with clearer sectional separation, turns the blunt counts list into composed metric cards, and makes area backlog summaries feel like real product surfaces instead of raw rollup rows.
- `Health` now frames the system-check control inside a calmer action tray, upgrades the trust summary into stronger metric cards, and keeps repair-focus items visible through structured surfaces without weakening the real-failure contract.
- `Areas` now uses a stronger spotlight summary, adds a clearer area-creation framing cue, separates normal area actions from destructive remove actions, and makes the route feel more composed and less like a legacy admin page.

### What did not change

- No route names changed.
- No workflow semantics changed.
- No persistence boundaries changed.
- No approval-gated Google Calendar behavior changed.
- No truthfulness language around local vs account-backed behavior was removed.

### Proof

- `pnpm --filter @lifeos/web test -- src/__tests__/phase4aPersistence.test.tsx src/__tests__/healthPage.test.tsx src/__tests__/workflowAreaAccent.test.tsx`
- `pnpm --filter @lifeos/web test:e2e -- tests/e2e/workflow-hierarchy.spec.ts tests/e2e/p0-ux-regression.spec.ts`

### Risk

Low. This pass stayed inside route composition and shared presentation classes. The only regressions found were proof-surface mismatches caused by polishing away list/text semantics, and those were corrected before completion.
