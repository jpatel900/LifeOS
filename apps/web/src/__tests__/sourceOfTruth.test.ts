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
    expect(() => readRepoFile("apps/web/src/components/AppShell.tsx")).toThrow();
  });

  it("does not export app-local types with canonical schema entity names", () => {
    const localTypes = readRepoFile("apps/web/src/lib/types.ts");

    expect(localTypes).not.toMatch(
      /export (?:interface|type) (?:Area|Task|Project|CalendarBlock|ExecutionSession|HealthCheck)\b/,
    );
    expect(localTypes).toContain("Phase 2 mock-only UI view models");
  });

  it("keeps Phase 4E Supabase browser persistence limited to approved local workflow tables", () => {
    const files = [
      "apps/web/src/lib/data/workflow.ts",
      "apps/web/src/lib/data/health.ts",
      "apps/web/src/lib/supabase/browser.ts",
      "apps/web/src/lib/supabase/config.ts",
      "apps/web/src/app/capture/page.tsx",
      "apps/web/src/app/settings/areas/page.tsx",
      "apps/web/src/app/triage/page.tsx",
      "apps/web/src/app/calendar/page.tsx",
      "apps/web/src/app/health/page.tsx",
    ].map(readRepoFile);
    const source = files.join("\n");

    expect(source).not.toMatch(/service[_-]?role|SUPABASE_SERVICE/i);
    expect(source).not.toMatch(/openai|OPENAI/);

    for (const table of ["external_write_events", "ai_recommendations"]) {
      expect(source).not.toContain(`from("${table}")`);
      expect(source).not.toContain(`from('${table}')`);
    }
  });
});
