const repoMap = {
  usageNote:
    "Routing aid only. Validate current behavior against AGENTS.md, authority docs, and source files. Quick checks are iteration-only and do not replace final validation.",
  areas: {
    capture: {
      purpose:
        "Raw capture UI, workflow state, and persistence boundary into capture_items.",
      readFirst: [
        "apps/web/src/app/capture/page.tsx",
        "apps/web/src/lib/data/workflow.ts",
        "apps/web/src/lib/WorkflowContext.tsx",
      ],
      likelyFiles: [
        "apps/web/src/lib/workflow.ts",
        "apps/web/src/__tests__/capture.test.tsx",
        "apps/web/src/__tests__/WorkflowContext.test.tsx",
        "apps/web/src/__tests__/sourceOfTruth.test.ts",
      ],
      risks: [
        "Raw capture must persist before parsing.",
        "Workflow hydration must stay SSR/CSR-safe.",
        "Do not broaden browser writes beyond approved data paths.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- capture.test.tsx WorkflowContext.test.tsx",
        "pnpm --filter @lifeos/web test -- workflow.test.ts",
      ],
    },
    "parse-capture-ai": {
      purpose:
        "Server-only parse_capture route, schema contract, prompt contract, and mock fallback.",
      readFirst: [
        "packages/schemas/src/parse-capture.ts",
        "apps/web/src/app/api/parse-capture/route.ts",
        "apps/web/src/lib/ai/parseCapture.ts",
        ".agents/skills/lifeos-schema-ai/SKILL.md",
      ],
      likelyFiles: [
        "apps/web/src/lib/ai/parseCaptureService.ts",
        "apps/web/src/lib/ai/parseCaptureWorkflow.ts",
        "apps/web/src/lib/ai/prompts/parseCapturePrompt.ts",
        "apps/web/src/app/api/parse-capture/route.test.ts",
        "packages/schemas/src/parse-capture.regression.test.ts",
      ],
      risks: [
        "Do not move parser logic into browser code.",
        "AI output must validate before any durable write.",
        "Mock fallback and safe failure paths must remain intact.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- parseCapture",
        "pnpm --filter @lifeos/schemas test -- parse-capture.regression.test.ts",
      ],
    },
    schemas: {
      purpose:
        "Shared Zod contracts and exported types used across app and tests.",
      readFirst: [
        "docs/ENGINEERING_INVARIANTS.md",
        "packages/schemas/src/index.ts",
        ".agents/skills/lifeos-schema-ai/SKILL.md",
      ],
      likelyFiles: [
        "packages/schemas/src/parse-capture.ts",
        "packages/schemas/src/entities.ts",
        "packages/schemas/src/index.test.ts",
      ],
      risks: [
        "Do not weaken validators to satisfy callers.",
        "Shared exports are a cross-package boundary.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/schemas type-check",
        "pnpm --filter @lifeos/schemas test",
      ],
    },
    "supabase-rls": {
      purpose:
        "Supabase-backed persistence, grants, and user-ownership boundaries.",
      readFirst: [
        "docs/ENGINEERING_INVARIANTS.md",
        ".agents/skills/lifeos-supabase-rls/SKILL.md",
        "apps/web/src/lib/data/workflow.ts",
        "apps/web/src/__tests__/phase4aRls.local.test.ts",
      ],
      likelyFiles: [
        "supabase/migrations",
        "apps/web/src/lib/data",
        "apps/web/src/__tests__/phase4aRls.local.test.ts",
      ],
      risks: [
        "Grants and RLS are separate controls.",
        "Browser Data API access must stay narrow.",
        "User-owned table changes need opt-in local RLS proof.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- workflow.test.ts health.test.ts",
        "Opt-in local: phase4aRls.local.test.ts after supabase reset and env refresh.",
      ],
    },
    calendar: {
      purpose:
        "Local planning plus approval-gated Google Calendar connect, freebusy, and create-event flows.",
      readFirst: [
        "docs/ENGINEERING_INVARIANTS.md",
        ".agents/skills/lifeos-calendar-external-writes/SKILL.md",
        "apps/web/src/app/calendar/page.tsx",
      ],
      likelyFiles: [
        "apps/web/src/app/api/google-calendar",
        "apps/web/src/lib/googleCalendar",
        "apps/web/src/lib/externalWrites",
      ],
      risks: [
        "External writes must stay explicit and approval-gated.",
        "Audit logging must survive failures.",
        "Do not expose token-handling or service-role logic to clients.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- google-calendar",
        "pnpm --filter @lifeos/web test -- calendar",
      ],
    },
    ui: {
      purpose:
        "App shell, route composition, workflow-provider-backed UI surfaces, and handoff cockpit UI context.",
      readFirst: [
        "design_handoff_lifeos/README.md",
        "apps/web/src/app/components/AppShell.tsx",
        "apps/web/src/app/components/LifeOSCockpit.tsx",
        "apps/web/src/lib/WorkflowContext.tsx",
      ],
      likelyFiles: [
        "apps/web/src/app",
        "apps/web/src/components/ui",
        "apps/web/tests/e2e",
        "apps/web/src/__tests__/sourceOfTruth.test.ts",
      ],
      risks: [
        "Home must remain read-only and shell mutation must stay off `/`.",
        "Provider/shell regressions can hide behind direct page tests.",
        "Mock-safe fallback behavior must remain intact.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- src/__tests__/sourceOfTruth.test.ts src/__tests__/routeSmoke.test.tsx",
        "pnpm --filter @lifeos/web test:e2e -- tests/e2e/p0-ux-regression.spec.ts tests/e2e/workflow-hierarchy.spec.ts",
      ],
    },
    "health-observability": {
      purpose:
        "Deterministic health checks and shared observability wrapper safety.",
      readFirst: [
        "apps/web/src/app/health/page.tsx",
        "apps/web/src/lib/data/health.ts",
        "apps/web/src/lib/observability/index.ts",
      ],
      likelyFiles: [
        "apps/web/src/lib/observability",
        "apps/web/src/lib/data/health.test.ts",
      ],
      risks: [
        "Health logic must stay deterministic.",
        "Observability must remain scrubbed and no-op-safe when unconfigured.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- health.test.ts",
        "pnpm --filter @lifeos/web test -- observability",
      ],
    },
    "projects-tasks": {
      purpose:
        "Project/task operating-layer planning and current task-project model boundaries.",
      readFirst: [
        "docs/REQUIREMENTS.md",
        "docs/DATA_MODEL.md",
        "docs/UX_FLOWS.md",
        "docs/ENGINEERING_INVARIANTS.md",
      ],
      likelyFiles: [
        "docs/PROJECT_STATE.md",
        "docs/KNOWN_ISSUES.md",
        "apps/web/src/lib/data/workflow.ts",
      ],
      risks: [
        "Do not expand beyond current V1 scope without approved requirements updates.",
        "Navigation containment must preserve the six primary workflow screens.",
      ],
      quickChecks: [
        "Re-check REQUIREMENTS.md NFR-005 and explicit non-goals before proposing new views or surfaces.",
      ],
    },
    docs: {
      purpose: "Authority docs, handoff state, and agent-maintenance guidance.",
      readFirst: [
        "AGENTS.md",
        "README.md",
        "docs/PROJECT_STATE.md",
        "docs/ENGINEERING_INVARIANTS.md",
      ],
      likelyFiles: [
        "docs/REQUIREMENTS.md",
        "docs/ARCHITECTURE.md",
        "docs/TEST_PLAN.md",
        ".agents/skills",
        "docs/doc-registry.json",
      ],
      risks: [
        "Do not fork or dilute authority hierarchy.",
        "Keep routing docs concise.",
        "Do not create per-session notes.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- docRegistry.test.ts",
        "pnpm format:check",
      ],
    },
    tests: {
      purpose:
        "Fast entry point for source-of-truth guards, targeted route tests, and opt-in RLS proof.",
      readFirst: [
        "docs/ENGINEERING_INVARIANTS.md",
        "docs/TEST_PLAN.md",
        ".agents/skills/lifeos-testing/SKILL.md",
      ],
      likelyFiles: [
        "apps/web/src/__tests__",
        "apps/web/tests/e2e",
        "packages/schemas/src",
      ],
      risks: [
        "Green narrow tests do not replace final validation.",
        "Static guard tests are source-of-truth boundaries, not noise.",
      ],
      quickChecks: [
        "pnpm --filter @lifeos/web test -- sourceOfTruth.test.ts",
        "pnpm --filter @lifeos/schemas test",
      ],
    },
  },
};

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function printAvailableAreas(areaNames) {
  console.error(`Available areas: ${areaNames.join(", ")}`);
}

function printList(label, values) {
  console.log(`${label}:`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

const areaNames = Object.keys(repoMap.areas).sort();
const areaName = process.argv[2];

if (!areaName) {
  exitWithError("Usage: pnpm agent:context <area>");
}

if (!Object.prototype.hasOwnProperty.call(repoMap.areas, areaName)) {
  console.error(`Unknown area: ${areaName}`);
  printAvailableAreas(areaNames);
  process.exit(1);
}

const area = repoMap.areas[areaName];

console.log(`Area: ${areaName}`);
console.log(`Purpose: ${area.purpose}`);
printList("Read first", area.readFirst);
printList("Likely files", area.likelyFiles);
printList("Risks", area.risks);
console.log(
  "Quick checks: iteration only; final validation still follows AGENTS.md.",
);
for (const check of area.quickChecks) {
  console.log(`- ${check}`);
}
