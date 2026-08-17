/**
 * Architecture boundaries enforced as CI rules (chore/adopt-dependency-cruiser).
 *
 * Two run targets share this one config (see package.json "depcruise" script
 * and scripts/agent/run-depcruise.mjs):
 *   - apps/web/src        (needs --ts-config apps/web/tsconfig.json for the
 *                          "@/*" -> "./src/*" alias)
 *   - packages/*\/src      (plain relative + workspace-package imports, no
 *                          ts-config alias needed)
 *
 * Each rule below cites the evidence it was verified against on 2026-08-11
 * (origin/main @ 1f2ae684, post d7a5f535 removal of packages/ui + packages/utils).
 * Vendor-SDK-import and CLI-thinness boundaries are intentionally NOT
 * duplicated here — they already have dedicated vitest guards:
 *   - apps/web/src/__tests__/sourceOfTruth.test.ts:438
 *   - packages/cli/src/boundary.test.ts
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "No import cycles anywhere in apps/web/src or packages/*/src. Zero " +
        "circular-import violations verified on origin/main @ 1f2ae684 (2026-08-11).",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-not-to-apps",
      severity: "error",
      comment:
        "Shared packages must not depend on the app. Layering invariant: " +
        "packages/* are consumed BY apps/web, never the reverse. Zero " +
        "violations verified on origin/main @ 1f2ae684 (2026-08-11).",
      from: { path: "^packages" },
      to: { path: "^apps" },
    },
    {
      name: "schemas-stays-leaf",
      severity: "error",
      comment:
        "packages/schemas is the leaf of the workspace-package graph: it " +
        "must not import any other workspace package. packages/types -> " +
        "packages/schemas is the only allowed cross-package direction " +
        "(packages/types/package.json depends on @lifeos/schemas) — this " +
        "rule does not restrict that edge, only edges OUT of schemas. Zero " +
        "violations verified on origin/main @ 1f2ae684 (2026-08-11).",
      from: { path: "^packages/schemas" },
      to: { path: "^(packages/(types|cli)|apps)|^@lifeos/" },
    },
    {
      name: "shared-ui-primitives-pure",
      severity: "error",
      comment:
        "apps/web/src/components must stay presentation-only: no direct " +
        "reach into the data or Supabase layers. Zero violations verified " +
        "on origin/main @ 1f2ae684 (2026-08-11). (The warn-severity " +
        "moments-components-direct-data-access rule below tracks the " +
        "narrower, already-entrenched app/components offenders separately.)",
      from: { path: "^apps/web/src/components" },
      to: { path: "^apps/web/src/lib/(data|supabase)" },
    },
    {
      name: "no-prod-to-test",
      severity: "error",
      comment:
        "Production modules must not import test files. " +
        "apps/web/src/lib/mockData.ts is a legitimate demo-mode PRODUCTION " +
        "module (not a test double) — its filename does not match the " +
        "__tests__|\\.test\\. target pattern, so it is unaffected by this " +
        "rule. Zero violations verified on origin/main @ 1f2ae684 (2026-08-11).",
      from: { pathNot: "(__tests__|\\.test\\.)" },
      to: { path: "(__tests__|\\.test\\.)" },
    },
    {
      name: "api-routes-no-react-components",
      severity: "error",
      comment:
        "API route handlers must not import React components. Scoped to " +
        "*.tsx so the two verified pure-logic .ts imports from components/ " +
        "(momentsViewModel.ts, formatTime.ts, both imported by " +
        "apps/web/src/app/api/brief/telegram/route.ts) do not trip this " +
        "rule — only importing an actual .tsx component from a route would. " +
        "Zero violations verified on origin/main @ 1f2ae684 (2026-08-11).",
      from: { path: "^apps/web/src/app/api" },
      to: { path: "^apps/web/src/app/components/.*\\.tsx$" },
    },
    {
      name: "moments-components-direct-data-access",
      severity: "warn",
      comment:
        "Entrenched pattern, not yet block-worthy: apps/web/src/app/components " +
        "reaching directly into lib/data or lib/supabase instead of going " +
        "through the context layer. 11 known offenders as of 2026-08-11 " +
        "(LifeOSCockpit, GoogleCalendarApprovalBridge, HealthSheet, " +
        "MastheadSaveState, OnboardingRitual, TodayMoments, " +
        "useCloseMomentRollups, HealthView, DemoModeBanner, AuthAffordance, " +
        "useReEntryRitual); the context layer is the intended path. Burn " +
        "this list down before flipping the rule to error severity.",
      from: { path: "^apps/web/src/app/components" },
      to: { path: "^apps/web/src/lib/(data|supabase)" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(^|/)(node_modules|dist|\\.next|\\.turbo|coverage)($|/)",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
