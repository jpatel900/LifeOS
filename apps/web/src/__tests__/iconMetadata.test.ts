import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// #596: Next.js treats `apps/web/src/app/icon.svg` as a file-convention
// metadata route AND `apps/web/public/icon.svg` as a static asset served at
// the same `/icon.svg` path. Having both triggered "A conflicting public
// file and page file was found for path /icon.svg" during dev, which the
// e2e run's flake logs traced to intermittent /icon.svg 500s under load.
// `apps/web/src/app/layout.tsx` already declares `/icon.svg` explicitly in
// `metadata.icons`, and `favicon.ico/route.ts` redirects to it — both
// resolve through the public static file, so the app-router file-convention
// copy is the redundant source. This guard keeps exactly one canonical
// `/icon.svg` source so the conflict can't silently come back.

const webRoot = resolve(__dirname, "..", "..");

describe("icon.svg has a single canonical source (#596)", () => {
  it("keeps the public static asset", () => {
    expect(existsSync(resolve(webRoot, "public/icon.svg"))).toBe(true);
  });

  it("does not also define the app-router file-convention icon route", () => {
    expect(existsSync(resolve(webRoot, "src/app/icon.svg"))).toBe(false);
  });

  it("layout metadata still declares /icon.svg as an icon source", () => {
    const layout = readFileSync(resolve(webRoot, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('{ url: "/icon.svg", type: "image/svg+xml" }');
  });
});
