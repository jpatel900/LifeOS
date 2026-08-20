import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #687 C2-S6 — the filesystem route allowlist.
 *
 * `noLegacyRouteLinks.test.ts` stops the CURRENT surface from linking to a
 * retired route; it says nothing about a NEW route file appearing on disk
 * (nobody has to link to a page for Next's file-system router to serve it —
 * dropping a `page.tsx` anywhere under `app/` is enough). This is the guard
 * that makes a brand-new legacy-shaped route impossible: it enumerates every
 * `page.tsx` in the app router and fails on strict set equality against the
 * 11 known files, so an addition, a removal, or a rename all fail loudly.
 *
 * The 11: `/` (moments home), `/login`, `/settings/areas` (owner-ratified
 * keep, out of C2-S6 scope), plus the 8 flag-gated redirect shims —
 * `/today`, `/capture`, `/triage`, `/execute`, `/calendar`, `/review`,
 * `/health`, `/areas`.
 */
const APP_DIR = [
  resolve(process.cwd(), "src/app"),
  resolve(process.cwd(), "apps/web/src/app"),
].find((dir) => existsSync(dir))!;

const EXPECTED_ROUTES = [
  "",
  "login",
  "settings/areas",
  "today",
  "capture",
  "triage",
  "execute",
  "calendar",
  "review",
  "health",
  "areas",
].sort();

function findPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findPageFiles(full));
      continue;
    }
    if (entry === "page.tsx" || entry === "page.ts") {
      out.push(full);
    }
  }
  return out;
}

function routeFor(pageFile: string): string {
  return pageFile
    .slice(APP_DIR.length)
    .split(sep)
    .join("/")
    .replace(/\/page\.tsx?$/, "")
    .replace(/^\//, "");
}

describe("filesystem route allowlist (#687 C2-S6)", () => {
  const pageFiles = findPageFiles(APP_DIR);

  // Minimum-match assertion so an empty/broken glob can never pass
  // vacuously (the depcruise silent-vacuous-pass lesson) — this must equal
  // the known count exactly, not just clear a floor, because the whole point
  // of this guard is that the SET is closed.
  it("finds exactly the known page.tsx files", () => {
    expect(pageFiles.length).toBe(EXPECTED_ROUTES.length);
  });

  it("the route set is exactly the 11 allowed routes — no more, no less", () => {
    const found = pageFiles.map(routeFor).sort();
    expect(found).toEqual(EXPECTED_ROUTES);
  });
});
