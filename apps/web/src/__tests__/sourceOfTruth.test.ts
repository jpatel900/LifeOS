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

  it("keeps plain-language primary UX while preserving technical truth in disclosures", () => {
    const appShell = normalizeWhitespace(
      readRepoFile("apps/web/src/app/components/AppShell.tsx"),
    );
    const capture = normalizeWhitespace(
      readRepoFile("apps/web/src/app/capture/page.tsx"),
    );
    const triage = normalizeWhitespace(
      readRepoFile("apps/web/src/app/triage/page.tsx"),
    );
    const execute = normalizeWhitespace(
      readRepoFile("apps/web/src/app/execute/page.tsx"),
    );
    const calendar = normalizeWhitespace(
      readRepoFile("apps/web/src/app/calendar/page.tsx"),
    );
    const health = normalizeWhitespace(
      readRepoFile("apps/web/src/app/health/page.tsx"),
    );
    const settings = normalizeWhitespace(
      readRepoFile("apps/web/src/app/settings/areas/page.tsx"),
    );

    expect(appShell).toContain("Workflow area (session)");
    expect(appShell).toContain("Session workflow area:");
    expect(appShell).toContain("Saves in this browser only.");
    expect(capture).toContain("AI sorting is off");
    expect(capture).toContain("Storage mode:");
    expect(capture).toContain("Developer details");
    expect(capture).toContain("Storage mode id:");
    expect(capture).toContain("this browser only");
    expect(triage).toContain("Saved workspace:");
    expect(triage).toContain("Drafts shown from this browser.");
    expect(triage).toContain("Acceptance storage mode id:");
    expect(triage).toContain("does not move the item yet");
    expect(calendar).toContain("Check calendar conflicts");
    expect(calendar).toContain("Create Google Calendar event");
    expect(calendar).toContain("Adjust time");
    expect(calendar).toContain(
      "Nothing goes to Google Calendar until you approve it.",
    );
    expect(calendar).toContain("Developer details");
    expect(calendar).toContain("Storage mode id:");
    expect(execute).toContain("Stop (demo mode only)");
    expect(execute).toContain("Stop (this browser)");
    expect(execute).toContain("Developer details");
    expect(execute).toContain("Storage mode id:");
    expect(health).toContain("Connection checks");
    expect(health).toContain("Developer details");
    expect(health).toContain("Storage mode id:");
    expect(settings).toContain("Storage mode:");
    expect(settings).toContain("Storage mode id:");
    expect(settings).toContain("planned time blocks");
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
});
