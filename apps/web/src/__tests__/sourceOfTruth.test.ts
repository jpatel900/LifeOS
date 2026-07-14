import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const IGNORED_SCAN_DIRECTORIES = new Set([
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const WORKFLOW_STATE_ANNOTATION_ALLOWLIST = [
  // Legitimate reachability helper boundary: tests must receive WorkflowState only through these transition wrappers.
  "apps/web/src/__tests__/helpers/workflowReachability.ts",
];

function workflowStateAnnotationTestFiles() {
  return walkRepoFiles("apps/web/src/__tests__").filter(
    (file) =>
      /apps\/web\/src\/__tests__\/.*\.(?:test|spec)\.(?:ts|tsx)$/.test(file) ||
      /apps\/web\/src\/__tests__\/helpers\/[^/]+\.ts$/.test(file),
  );
}

function walkRepoFiles(relativePath: string): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const currentPath = resolve(repoRoot, relativePath);

  return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath = `${relativePath}/${entry.name}`.replace(
      /\\/g,
      "/",
    );

    if (entry.isDirectory()) {
      if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
        return [];
      }

      return walkRepoFiles(nextRelativePath);
    }

    if (!entry.isFile()) {
      return [];
    }

    return nextRelativePath;
  });
}

describe("source-of-truth boundaries", () => {
  it("requires cockpit model tests to use transition-reachable workflow helpers", () => {
    const testFiles = walkRepoFiles("apps/web/src/__tests__").filter(
      (file) =>
        /\.(?:test|spec)\.(?:ts|tsx)$/.test(file) ||
        file.endsWith("helpers/workflowReachability.ts"),
    );
    const offenders = testFiles.filter((file) => {
      if (file === "apps/web/src/__tests__/helpers/workflowReachability.ts") {
        return false;
      }
      const source = readRepoFile(file);
      return /\bbuild(?:CockpitViewModel|TodayCockpitModel)\s*\(/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it("cockpit/workflow tests may not annotate hand-built WorkflowState literals outside the reachability helper", () => {
    const annotationPattern = /(?::|\bas)\s+WorkflowState\b/;
    const allowlist = new Set(WORKFLOW_STATE_ANNOTATION_ALLOWLIST);
    const offenders = workflowStateAnnotationTestFiles().filter((file) => {
      if (allowlist.has(file)) {
        return false;
      }

      return annotationPattern.test(readRepoFile(file));
    });

    expect(
      offenders,
      `Build WorkflowState through workflowSeed() + transition helpers, or add an annotated WORKFLOW_STATE_ANNOTATION_ALLOWLIST entry. Offenders: ${offenders.join(
        ", ",
      )}`,
    ).toEqual([]);
  });

  it("keeps the WorkflowState-annotation allowlist shrink-only", () => {
    const annotationPattern = /(?::|\bas)\s+WorkflowState\b/;
    const staleEntries = WORKFLOW_STATE_ANNOTATION_ALLOWLIST.filter(
      (file) => !annotationPattern.test(readRepoFile(file)),
    );

    expect(staleEntries).toEqual([]);
  });

  it("keeps AppShell singular and imported from the app shell boundary", () => {
    const layout = readRepoFile("apps/web/src/app/layout.tsx");

    expect(layout).toContain('from "./components/AppShell"');
    expect(() =>
      readRepoFile("apps/web/src/components/AppShell.tsx"),
    ).toThrow();
  });

  it("does not export app-local types with canonical schema entity names", () => {
    const localTypes = readRepoFile("apps/web/src/lib/types.ts");

    expect(localTypes).not.toMatch(
      /export (?:interface|type) (?:Area|Task|Project|CalendarBlock|ExecutionSession|HealthCheck)\b/,
    );
    expect(localTypes).toContain("Phase 2 mock-only UI view models");
  });

  it("suggestionRecordColumns includes resolution_reason and decided_by", () => {
    // KNOWN_ISSUES row 8 paydown: suggestionRecordColumns now lives in
    // workflow/shared.ts (workflow.ts is a re-export barrel).
    const workflow = readRepoFile("apps/web/src/lib/data/workflow/shared.ts");

    expect(workflow).toContain("resolution_reason");
    expect(workflow).toContain("decided_by");
  });

  it("overrideRecordColumns includes suggestion_id", () => {
    // KNOWN_ISSUES row 8 paydown: overrideRecordColumns now lives in
    // workflow/shared.ts (workflow.ts is a re-export barrel).
    const workflow = readRepoFile("apps/web/src/lib/data/workflow/shared.ts");

    expect(workflow).toContain("suggestion_id");
  });

  it("keeps browser persistence away from server-only calendar audit tables and secrets", () => {
    const files = [
      "apps/web/src/lib/data/workflow.ts",
      "apps/web/src/lib/data/health.ts",
      "apps/web/src/lib/supabase/browser.ts",
      "apps/web/src/lib/supabase/config.ts",
      "apps/web/src/app/capture/page.tsx",
      "apps/web/src/app/page.tsx",
      "apps/web/src/app/settings/areas/page.tsx",
      "apps/web/src/app/settings/areas/GoogleCalendarConnectionPanel.tsx",
      "apps/web/src/app/triage/page.tsx",
      "apps/web/src/app/calendar/page.tsx",
      "apps/web/src/app/health/page.tsx",
    ].map(readRepoFile);
    const source = files.join("\n");

    expect(source).not.toMatch(/service[_-]?role|SUPABASE_SERVICE/i);
    expect(source).not.toMatch(/openai|OPENAI/);
    expect(source).not.toMatch(
      /GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_REDIRECT_URI|GOOGLE_TOKEN_ENCRYPTION_KEY/,
    );
    expect(source).not.toMatch(/googleapis|calendar\.events/i);

    for (const table of [
      "google_calendar_connections",
      "external_write_events",
      "ai_recommendations",
    ]) {
      expect(source).not.toContain(`from("${table}")`);
      expect(source).not.toContain(`from('${table}')`);
    }
  });

  it("keeps client-facing Supabase config on static NEXT_PUBLIC env lookups", () => {
    const config = readRepoFile("apps/web/src/lib/supabase/config.ts");

    expect(config).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(config).toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(config).not.toMatch(/env:\s*SupabaseEnv\s*=\s*process\.env/);
  });

  it("keeps Google Calendar integration on server routes only through Phase 7E", () => {
    const clientFiles = [
      "apps/web/src/app/calendar/page.tsx",
      "apps/web/src/app/page.tsx",
      "apps/web/src/app/settings/areas/page.tsx",
      "apps/web/src/app/settings/areas/GoogleCalendarConnectionPanel.tsx",
      "apps/web/src/lib/data/workflow.ts",
      "apps/web/src/lib/supabase/browser.ts",
    ].map(readRepoFile);
    const clientSource = clientFiles.join("\n");

    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/connect/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/callback/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/connection/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/disconnect/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/freebusy/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile(
        "apps/web/src/app/api/google-calendar/create-event/route.ts",
      ),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/write-event/route.ts"),
    ).toThrow();
    expect(clientSource).not.toMatch(
      /from ["']@\/lib\/googleCalendar\/oauth["']/,
    );
    expect(clientSource).not.toMatch(
      /from ["']@\/lib\/googleCalendar\/server["']/,
    );
    expect(clientSource).not.toMatch(
      /from ["']@\/lib\/googleCalendar\/freebusy["']/,
    );
    expect(clientSource).not.toMatch(
      /from ["']@\/lib\/googleCalendar\/events["']/,
    );

    const freebusyRoute = readRepoFile(
      "apps/web/src/app/api/google-calendar/freebusy/route.ts",
    );
    expect(freebusyRoute).not.toMatch(/events\.insert|calendar\.events/i);
    expect(freebusyRoute).not.toMatch(/from ["']@\/lib\/ai\//);

    const createEventRoute = readRepoFile(
      "apps/web/src/app/api/google-calendar/create-event/route.ts",
    );
    expect(createEventRoute).toContain("approved");
    expect(createEventRoute).toContain("createPendingExternalWriteEvent");
    expect(createEventRoute).not.toMatch(/from ["']@\/lib\/ai\//);
  });

  it("keeps OpenAI parsing behind the server parse-capture route", () => {
    const clientFiles = [
      "apps/web/src/app/capture/page.tsx",
      "apps/web/src/lib/WorkflowContext.tsx",
      "apps/web/src/lib/workflow.ts",
      "apps/web/src/lib/ai/parseCaptureWorkflow.ts",
    ].map(readRepoFile);
    const clientSource = clientFiles.join("\n");

    expect(clientSource).not.toMatch(/from ["']@\/lib\/ai\/parseCapture["']/);
    expect(clientSource).not.toMatch(/from ["']\.\/parseCapture["']/);
    expect(clientSource).not.toMatch(
      /OPENAI_API_KEY|AI_MODEL_CHEAP|AI_MODEL_STANDARD|AI_MODEL_STRONG|AI_PARSE_CAPTURE_ENABLED/,
    );

    const route = readRepoFile("apps/web/src/app/api/parse-capture/route.ts");
    expect(route).toContain('from "@/lib/ai/parseCaptureService"');
    expect(route).toContain('from "@/lib/observability"');
    expect(route).not.toMatch(/from ["']@sentry\/nextjs["']/);
  });

  it("keeps workflow routes as thin handoff cockpit aliases", () => {
    const cockpit = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/LifeOSCockpit.tsx"),
    );
    const cockpitRoute = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/CockpitRoute.tsx"),
    );
    const home = normalizeWhitespace(readRepoFile("apps/web/src/app/page.tsx"));
    const capture = normalizeWhitespace(
      readRepoFile("apps/web/src/app/capture/page.tsx"),
    );
    const triage = normalizeWhitespace(
      readRepoFile("apps/web/src/app/triage/page.tsx"),
    );
    const execute = normalizeWhitespace(
      readRepoFile("apps/web/src/app/execute/page.tsx"),
    );
    const review = normalizeWhitespace(
      readRepoFile("apps/web/src/app/review/page.tsx"),
    );
    const calendar = normalizeWhitespace(
      readRepoFile("apps/web/src/app/calendar/page.tsx"),
    );
    const health = normalizeWhitespace(
      readRepoFile("apps/web/src/app/health/page.tsx"),
    );
    const globalsCss = normalizeWhitespace(
      readRepoFile("apps/web/src/app/globals.css"),
    );
    const agents = normalizeWhitespace(readRepoFile("AGENTS.md"));
    const handoffReadme = normalizeWhitespace(
      readRepoFile("design_handoff_lifeos/README.md"),
    );
    // #556: the capture stage's primary save action was extracted into the
    // shared CaptureCore component (reused by every capture surface), so
    // its label no longer appears as a literal string in the cockpit file
    // itself — the cockpit composes CaptureCore instead.
    const captureCore = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/moments/CaptureCore.tsx"),
    );
    // #590 slice 2: the per-stage screens were mechanically extracted into
    // apps/web/src/app/components/cockpit/ — LifeOSCockpit.tsx is now the
    // thin stage-router/shell that composes them, so stage-screen literals
    // live in the per-stage files rather than the shell itself.
    const captureView = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/cockpit/CaptureView.tsx"),
    );
    const planView = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/cockpit/PlanView.tsx"),
    );
    const overviewView = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/cockpit/OverviewView.tsx"),
    );

    expect(cockpitRoute).toContain("LifeOSCockpit");
    for (const [source, stage] of [
      [home, "today"],
      [capture, "capture"],
      [triage, "triage"],
      [calendar, "plan"],
      [execute, "execute"],
      [review, "review"],
      [health, "health"],
    ] as const) {
      expect(source).toContain("CockpitRoute");
      expect(source).toContain(`stage="${stage}"`);
      expect(source).not.toContain("WorkflowPageHeader");
      expect(source).not.toContain("DiagnosticsDisclosure");
    }

    expect(cockpit).toContain('data-testid="lifeos-cockpit"');
    expect(cockpit).toContain("CaptureView");
    expect(captureView).toContain("CaptureCore");
    expect(captureCore).toContain("Save thought");
    expect(planView).toContain("Google writes are separate");
    expect(overviewView).toContain("All areas overview");
    expect(globalsCss).toContain(".lifeos-cockpit");
    expect(agents).toContain("design_handoff_lifeos/README.md");
    expect(handoffReadme).toContain("One screen component");
    expect(handoffReadme).toContain("view router");
  });

  it("keeps the handoff token and accent rules explicit", () => {
    const cockpit = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/LifeOSCockpit.tsx"),
    );
    const accent = normalizeWhitespace(
      readRepoFile("apps/web/src/lib/cockpit/accent.ts"),
    );
    const globalsCss = normalizeWhitespace(
      readRepoFile("apps/web/src/app/globals.css"),
    );

    expect(cockpit).toContain('data-theme={dark ? undefined : "light"}');
    expect(cockpit).toContain("buildCockpitAccentStyle");
    expect(accent).toContain('mix(acc, dark ? "#ffffff" : "#000000", 0.16)');
    expect(accent).toContain('lum(acc) > 0.55 ? "#1a1a14" : "#ffffff"');
    expect(globalsCss).toContain("--bd: #14151a");
    expect(globalsCss).toContain('.lifeos-cockpit[data-theme="light"]');
  });

  // Raw-hex styling coverage moved to the G-UX-3 guard in
  // coherenceRegistry.test.ts, which scans a SUPERSET of these nine files
  // (all app/components/** plus the seven cockpit route pages) with
  // comment-stripping, so #NNN issue refs in comments no longer false-red.

  it("keeps cockpit header area edits on the persisted area path", () => {
    const cockpit = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/LifeOSCockpit.tsx"),
    );

    expect(cockpit).toContain("const result = await createArea(client");
    expect(cockpit).toContain("const areasResult = await listAreas(client)");
    expect(cockpit).toContain("syncPersistedAreas(areasResult.areas)");
    expect(cockpit).toContain("workflowAreaIdForPersistedArea(result.area)");
    expect(cockpit).toContain(
      "await updateAreaColor(createSupabaseBrowserClient()",
    );
  });

  it("keeps Home as read-only workflow routing with no calendar/event write helpers", () => {
    const home = readRepoFile("apps/web/src/app/page.tsx");

    expect(home).not.toMatch(/createGoogleCalendarEventFromProposal/);
    expect(home).not.toMatch(/acceptTimeBlockProposal/);
    expect(home).not.toMatch(/createTimeBlockProposal/);
    expect(home).not.toMatch(/markExecutionSession/);
    expect(home).not.toMatch(/getHealthDashboard/);
  });

  it("marks parser modules with explicit server runtime guards", () => {
    const parser = readRepoFile("apps/web/src/lib/ai/parseCapture.ts");
    const service = readRepoFile("apps/web/src/lib/ai/parseCaptureService.ts");

    expect(parser).toContain("function assertServerRuntime()");
    expect(parser).toContain("parseCapture must run on the server.");
    expect(service).toContain("function assertServerRuntime()");
    expect(service).toContain("parseCaptureService must run on the server.");
  });

  it("keeps Google Calendar config marked server-only", () => {
    const config = readRepoFile("apps/web/src/lib/googleCalendar/config.ts");

    expect(config).toContain("function assertServerRuntime()");
    expect(config).toContain("Google Calendar config must stay server-only.");
  });

  it("blocks direct vendor observability SDK imports outside the shared wrapper", () => {
    const sourceFiles = walkRepoFiles("apps/web/src").filter((path) =>
      /\.(ts|tsx)$/.test(path),
    );
    const vendorImportPattern =
      /from ["'](?:@sentry\/|posthog-js|posthog-node|langfuse)/;

    for (const file of sourceFiles) {
      expect(readRepoFile(file)).not.toMatch(vendorImportPattern);
    }
  });

  it("limits direct vendor observability SDK imports to approved root bootstrap files", () => {
    const sourceFiles = walkRepoFiles("apps/web").filter(
      (path) =>
        /\.(ts|tsx)$/.test(path) &&
        !path.includes("/.next/") &&
        !path.includes("/node_modules/"),
    );
    const vendorImportPattern =
      /from ["'](?:@sentry\/|posthog-js|posthog-node|@langfuse\/|langfuse|@opentelemetry\/)/;
    const allowlist = [
      "apps/web/instrumentation-client.ts",
      "apps/web/langfuse.server.config.ts",
      "apps/web/sentry.edge.config.ts",
      "apps/web/sentry.server.config.ts",
    ];

    const hits = sourceFiles.filter((file) =>
      vendorImportPattern.test(readRepoFile(file)),
    );

    expect(hits.sort()).toEqual(allowlist.sort());
  });

  it("routes request errors through shared observability instead of direct vendor SDK calls", () => {
    const instrumentation = readRepoFile("apps/web/instrumentation.ts");

    expect(instrumentation).toContain('from "./src/lib/observability"');
    expect(instrumentation).not.toMatch(/from ["']@sentry\/nextjs["']/);
    expect(instrumentation).not.toContain("request.headers.entries()");
  });

  it("keeps Langfuse tracing scoped to parse_capture server code", () => {
    const sourceFiles = walkRepoFiles("apps/web/src").filter(
      (path) =>
        /\.(ts|tsx)$/.test(path) &&
        !path.endsWith(".test.ts") &&
        !path.endsWith(".test.tsx"),
    );
    const traceUsageFiles = sourceFiles.filter((file) => {
      if (file.startsWith("apps/web/src/lib/observability/")) {
        return false;
      }

      return /traceParseCapture|traceAiOperation/.test(readRepoFile(file));
    });

    expect(traceUsageFiles).toEqual([
      "apps/web/src/lib/ai/parseCaptureService.ts",
    ]);
  });

  it("keeps Langfuse secrets server-only and out of client bundles", () => {
    const clientFiles = [
      "apps/web/instrumentation-client.ts",
      "apps/web/src/app/capture/page.tsx",
      "apps/web/src/lib/WorkflowContext.tsx",
      "apps/web/src/lib/workflow.ts",
    ].map(readRepoFile);
    const clientSource = clientFiles.join("\n");
    const envExample = readRepoFile(".env.example");
    const instrumentation = readRepoFile("apps/web/instrumentation.ts");

    expect(clientSource).not.toMatch(
      /LANGFUSE_PUBLIC_KEY|LANGFUSE_SECRET_KEY|LANGFUSE_BASE_URL|NEXT_PUBLIC_LANGFUSE/i,
    );
    expect(envExample).toContain("LANGFUSE_PUBLIC_KEY=");
    expect(envExample).toContain("LANGFUSE_SECRET_KEY=");
    expect(envExample).toContain("LANGFUSE_BASE_URL=");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_LANGFUSE/i);
    expect(instrumentation).toContain('import("./langfuse.server.config")');
    expect(() =>
      readRepoFile("apps/web/langfuse.server.config.ts"),
    ).not.toThrow();
  });

  it("uses polite live regions for non-destructive cockpit feedback", () => {
    const cockpit = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/LifeOSCockpit.tsx"),
    );
    const settings = normalizeWhitespace(
      readRepoFile("apps/web/src/app/settings/areas/page.tsx"),
    );
    const loadingState = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/WorkflowLoadingState.tsx"),
    );

    expect(cockpit).toContain('role="status"');
    expect(cockpit).toContain('aria-live="polite"');
    expect(settings).toContain(
      'createAreaFeedback.variant === "destructive" ? undefined : "polite"',
    );
    expect(settings).toContain(
      'colorFeedback.variant === "destructive" ? undefined : "polite"',
    );
    expect(loadingState).toContain('role="status"');
    expect(loadingState).toContain('aria-live="polite"');
  });
});
