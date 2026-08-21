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
 * 12 known files, so an addition, a removal, or a rename all fail loudly.
 *
 * The 13: `/` (moments home), `/login`, `/settings/areas` (owner-ratified
 * keep, out of C2-S6 scope), `/settings` (C2-S12B, #687 round-6 finding 2: a
 * NEW unconditional redirect shim to `/settings/areas` — unlike the 9 below,
 * NOT gated behind `NEXT_PUBLIC_MOMENTS_HOME`, since `/settings` never had a
 * cockpit-stage equivalent to roll back to), plus the 9 flag-gated redirect
 * shims — `/today`, `/capture`, `/triage`, `/execute`, `/calendar`, `/plan`
 * (C2-S10, #687 round-4: joins its siblings — `/calendar` is `/plan`'s own
 * legacy stage name, kept as a working old bookmark, not replaced),
 * `/review`, `/health`, `/areas`.
 */
const APP_DIR = [
  resolve(process.cwd(), "src/app"),
  resolve(process.cwd(), "apps/web/src/app"),
].find((dir) => existsSync(dir))!;

const EXPECTED_ROUTES = [
  "",
  "login",
  "settings",
  "settings/areas",
  "today",
  "capture",
  "triage",
  "execute",
  "calendar",
  "plan",
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

  // C2-S12B (#687 round-6): this title already said "11" while
  // `EXPECTED_ROUTES` held 12 entries before this lane's `/settings` addition
  // — a pre-existing drift, not introduced here. Now correctly 13.
  it("the route set is exactly the 13 allowed routes — no more, no less", () => {
    const found = pageFiles.map(routeFor).sort();
    expect(found).toEqual(EXPECTED_ROUTES);
  });
});
