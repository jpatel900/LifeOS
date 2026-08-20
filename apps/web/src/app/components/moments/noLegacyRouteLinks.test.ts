import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #687 guard: the moments home is the single current surface. Once the demoted
 * stage routes became flag-gated redirect shims, NO link or programmatic
 * navigation from the current surface may target them again — otherwise a
 * button would bounce the user through the legacy cockpit shell (or, post
 * rollback-retirement, a dead route). This scans the app tree and fails if
 * any file re-introduces an in-app link/push to a REDIRECTED legacy route.
 *
 * C2-S6 RATCHET (third application of this guard): `/calendar` and `/review`
 * join the forbidden set — they were the last two OWNER-GATE holdouts (plan
 * placement/proposals and review diagnostics existed only on the old page),
 * and the owner gate is now dead: ReviewSheet.tsx ports every one of those
 * capabilities (verified at file tier, #687 claim comment). All 8 demoted
 * routes are forbidden now. The scan root also widens from
 * `components/moments/` to all of `apps/web/src/app`, because a legacy link
 * anywhere in the shipped app is the same defect this guard exists to catch —
 * `components/moments/` was never a boundary the *risk* respected, just the
 * boundary the first version of this guard happened to draw.
 *
 * Earlier ratchets (kept for history):
 *  - C2-S4: `/health` moved OUT of the allowance and INTO the forbidden set
 *    (PORT ALL FOUR, ratified 2026-07-26).
 *  - C2-S5: `/areas` joined it on the same decision — the port had to CREATE
 *    its entry point (`SideRail`'s "See all areas →" → `?sheet=areas`)
 *    rather than re-point an existing one.
 *
 * Exclusions from the widened scan (one reason each):
 *  - The 8 shim `page.tsx` files themselves: their whole job is to `redirect()`
 *    to (or, under the #590 rollback, render) these exact paths — that is the
 *    shim, not a violation of it.
 *  - `components/cockpit/**` and `components/CockpitRoute.tsx`: rollback-only
 *    code (the #590 escape hatch). It legitimately renders the seven-stage
 *    grid, whose internal navigation targets these very stages by design;
 *    retiring that navigation is the separate, owner-gated cockpit-code
 *    deletion this lane does not do.
 *  - `deepLink.ts`: the path strings there (historically) were data mapping a
 *    route to a target, never navigation themselves.
 *  - `*.test.*`: assertions about legacy routes (e.g. this file, or
 *    `legacyRouteRedirects.test.tsx`) are not app navigation.
 */
const REDIRECTED_ROUTES = [
  "today",
  "capture",
  "triage",
  "execute",
  "calendar",
  "review",
  "health",
  "areas",
] as const;

const FORBIDDEN_ROUTES = REDIRECTED_ROUTES;

const NAV_TO_LEGACY = new RegExp(
  String.raw`(?:href\s*=|router\.(?:push|replace)\s*\(|\bredirect\s*\()\s*["'\`]\/(?:` +
    FORBIDDEN_ROUTES.join("|") +
    String.raw`)(?:["'\`?/])`,
);

// Vitest's jsdom environment rewrites import.meta.url to a non-file scheme,
// so locate the app dir from the workspace cwd instead (vitest runs with cwd
// at apps/web; fall back to the repo-root layout for safety).
const APP_DIR = [
  resolve(process.cwd(), "src/app"),
  resolve(process.cwd(), "apps/web/src/app"),
].find((dir) => existsSync(dir))!;

const SHIM_PAGE_PATHS = new Set(
  REDIRECTED_ROUTES.map((route) =>
    resolve(APP_DIR, route, "page.tsx").split(sep).join("/"),
  ),
);

function isExcluded(full: string): boolean {
  const normalized = full.split(sep).join("/");
  if (/\.test\.(tsx?|jsx?)$/.test(normalized)) return true;
  if (SHIM_PAGE_PATHS.has(normalized)) return true;
  if (normalized.includes("/components/cockpit/")) return true;
  if (normalized.endsWith("/components/CockpitRoute.tsx")) return true;
  if (normalized.endsWith("/components/moments/deepLink.ts")) return true;
  return false;
}

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
    if (isExcluded(full)) continue;
    out.push(full);
  }
  return out;
}

describe("no legacy-route links from the current app surface (#687)", () => {
  const files = collect(APP_DIR);

  // Minimum-match floor (planted-violation self-check lives in the CI
  // report, not here — see PR body): an empty or near-empty glob must never
  // pass this guard vacuously. The widened scan (whole `app/` tree minus the
  // named exclusions) finds well over 100 files; 40 is a conservative floor
  // that still fails hard if the scan root regresses to something much
  // narrower than intended.
  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  for (const file of files) {
    it(`${file.replace(APP_DIR, "")} links no redirected legacy route`, () => {
      const src = readFileSync(file, "utf8");
      const match = NAV_TO_LEGACY.exec(src);
      expect(
        match,
        match
          ? `Found an in-app link to a legacy route the moments shell has replaced ("${match[0]}"). ` +
              "Target the moments equivalent instead (e.g. /?sheet=triage)."
          : undefined,
      ).toBeNull();
    });
  }
});
