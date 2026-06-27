import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_DATA_EXPORT_TABLES } from "@/lib/data/export";

// Static guards for docs/ENGINEERING_INVARIANTS.md. Each block names the
// invariant it enforces; weakening a guard to pass it violates the invariant.

const repoRoot = resolve(__dirname, "../../../..");

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
  const currentPath = resolve(repoRoot, relativePath);

  return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath = `${relativePath}/${entry.name}`.replace(
      /\\/g,
      "/",
    );

    if (entry.isDirectory()) {
      return IGNORED_SCAN_DIRECTORIES.has(entry.name)
        ? []
        : walkRepoFiles(nextRelativePath);
    }

    return entry.isFile() ? [nextRelativePath] : [];
  });
}

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

// Newline count, matching `wc -l`.
function countLines(content: string) {
  return (content.match(/\n/g) ?? []).length;
}

describe("INV-2 export coverage", () => {
  // Tables that intentionally never leave the database through export.
  const EXPORT_EXCLUSIONS = new Set([
    "google_calendar_connections", // encrypted OAuth token material
  ]);

  it("exports every user-owned table created by migrations", () => {
    const migrationFiles = walkRepoFiles("supabase/migrations").filter((f) =>
      f.endsWith(".sql"),
    );
    const createdTables = new Set<string>();

    for (const file of migrationFiles) {
      const sql = readRepoFile(file);
      for (const match of sql.matchAll(
        /^\s*create table (?:if not exists )?public\.([a-z0-9_]+)/gim,
      )) {
        createdTables.add(match[1]);
      }
    }

    expect(createdTables.size).toBeGreaterThan(0);

    const covered = new Set<string>([
      ...USER_DATA_EXPORT_TABLES,
      ...EXPORT_EXCLUSIONS,
    ]);
    const uncovered = [...createdTables].filter((t) => !covered.has(t));

    expect(
      uncovered,
      `New user-owned tables must be added to USER_DATA_EXPORT_TABLES in apps/web/src/lib/data/export.ts (or to the documented exclusion list here if they hold secrets): ${uncovered.join(", ")}`,
    ).toEqual([]);
  });
});

describe("INV-3 vendor seams", () => {
  const VENDOR_BOUNDARIES: Array<{ hostname: string; allowedDir: string }> = [
    { hostname: "api.openai.com", allowedDir: "apps/web/src/lib/ai/provider" },
    {
      hostname: "googleapis.com",
      allowedDir: "apps/web/src/lib/googleCalendar",
    },
  ];

  it("keeps vendor hostnames inside their adapter modules", () => {
    const sourceFiles = walkRepoFiles("apps/web/src").filter(
      (f) =>
        /\.(ts|tsx)$/.test(f) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(f) &&
        !f.includes("__tests__"),
    );

    for (const { hostname, allowedDir } of VENDOR_BOUNDARIES) {
      const violations = sourceFiles.filter(
        (f) => !f.startsWith(allowedDir) && readRepoFile(f).includes(hostname),
      );

      expect(
        violations,
        `${hostname} may only appear under ${allowedDir}; route vendor calls through the adapter instead: ${violations.join(", ")}`,
      ).toEqual([]);
    }
  });
});

describe("INV-4 module budgets", () => {
  const DEFAULT_PAGE_BUDGET = 800;

  // Grandfathered ceilings, set to each file's size when this guard landed.
  // Ceilings may be lowered as logic is extracted; they must never be raised.
  const GRANDFATHERED_PAGE_BUDGETS: Record<string, number> = {
    "apps/web/src/app/settings/areas/page.tsx": 943,
  };

  it("keeps route pages within their line budgets", () => {
    const pages = walkRepoFiles("apps/web/src/app").filter((f) =>
      f.endsWith("/page.tsx"),
    );
    const overages = pages.flatMap((page) => {
      const budget = GRANDFATHERED_PAGE_BUDGETS[page] ?? DEFAULT_PAGE_BUDGET;
      const lines = countLines(readRepoFile(page));
      return lines > budget ? [`${page}: ${lines} > ${budget}`] : [];
    });

    expect(
      overages,
      `Route pages exceeded their line budget. Extract pure logic into apps/web/src/lib/ (pattern: lib/planning/presentation.ts) instead of raising the ceiling: ${overages.join("; ")}`,
    ).toEqual([]);
  });

  it("removes grandfather entries when their pages reach the default budget", () => {
    const stale = Object.keys(GRANDFATHERED_PAGE_BUDGETS).filter(
      (page) =>
        countLines(readRepoFile(page)) <= DEFAULT_PAGE_BUDGET,
    );

    expect(
      stale,
      `These pages now fit the default budget; delete their grandfather entries to lock in the improvement: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
