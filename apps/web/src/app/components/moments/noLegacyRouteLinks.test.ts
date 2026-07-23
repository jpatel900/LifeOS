import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #687 guard: the moments home is the single current surface. Once the demoted
 * stage routes became flag-gated redirect shims, NO link or programmatic
 * navigation from the current surface may target them again — otherwise a
 * button would bounce the user through the legacy cockpit shell (or, post
 * rollback-retirement, a dead route). This scans the moments component tree
 * and fails if any file re-introduces an in-app link/push to a REDIRECTED
 * legacy route.
 *
 * Scope + allowances:
 *  - `deepLink.ts` is the mapping table itself (the path strings are data, not
 *    navigation) — excluded.
 *  - `/calendar`, `/review`, `/health`, and `/areas` are OWNER-GATE (real
 *    capabilities exist only on the old page), so they are intentionally NOT
 *    in the forbidden set; links to them (PlanSheet's "Open full view",
 *    `onOpenHealth`'s `router.push("/health")`) stay until the owner decides
 *    port/keep/drop.
 */
const REDIRECTED_ROUTES = ["today", "capture", "triage", "execute"] as const;

const NAV_TO_LEGACY = new RegExp(
  String.raw`(?:href\s*=|router\.(?:push|replace)\s*\(|\bredirect\s*\()\s*["'\`]\/(?:` +
    REDIRECTED_ROUTES.join("|") +
    String.raw`)(?:["'\`?/])`,
);

// Vitest's jsdom environment rewrites import.meta.url to a non-file scheme,
// so locate the moments dir from the workspace cwd instead (vitest runs with
// cwd at apps/web; fall back to the repo-root layout for safety).
const MOMENTS_DIR = [
  resolve(process.cwd(), "src/app/components/moments"),
  resolve(process.cwd(), "apps/web/src/app/components/moments"),
].find((dir) => existsSync(dir))!;

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
    if (/\.test\.(tsx?|jsx?)$/.test(entry)) continue;
    if (entry === "deepLink.ts") continue;
    out.push(full);
  }
  return out;
}

describe("no legacy-route links from the current moments surface (#687)", () => {
  const files = collect(MOMENTS_DIR);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file.replace(MOMENTS_DIR, "")} links no redirected legacy route`, () => {
      const src = readFileSync(file, "utf8");
      const match = NAV_TO_LEGACY.exec(src);
      expect(
        match,
        match
          ? `Found an in-app link to a redirected legacy route ("${match[0]}"). ` +
              "Target the moments equivalent instead (e.g. /?sheet=triage)."
          : undefined,
      ).toBeNull();
    });
  }
});
