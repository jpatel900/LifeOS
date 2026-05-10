import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
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

  it("keeps Google Calendar integration on server routes only through Phase 7E", () => {
    const clientFiles = [
      "apps/web/src/app/calendar/page.tsx",
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
      readRepoFile("apps/web/src/app/api/google-calendar/create-event/route.ts"),
    ).not.toThrow();
    expect(() =>
      readRepoFile("apps/web/src/app/api/google-calendar/write-event/route.ts"),
    ).toThrow();
    expect(clientSource).not.toMatch(/from ["']@\/lib\/googleCalendar\/oauth["']/);
    expect(clientSource).not.toMatch(/from ["']@\/lib\/googleCalendar\/server["']/);
    expect(clientSource).not.toMatch(/from ["']@\/lib\/googleCalendar\/freebusy["']/);
    expect(clientSource).not.toMatch(/from ["']@\/lib\/googleCalendar\/events["']/);

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
});
