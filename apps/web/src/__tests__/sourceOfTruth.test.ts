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
});
