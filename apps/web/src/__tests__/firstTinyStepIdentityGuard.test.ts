import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FR-023 slice F4 (#678) — no-second-writer guard.
 *
 * The first node of a task breakdown and `tasks.first_tiny_step` are ONE fact
 * (FR-023 criterion 3). That identity is derived in exactly one place — the
 * shared `resolveFirstStepNode` (apps/web/src/lib/taskmap/graph.ts) — and
 * written into `first_tiny_step` in the SAME update as the map, by the two
 * approve paths only:
 *   - the Supabase approve  (lib/data/workflow/taskMap.ts)
 *   - the local reducer     (lib/workflow/taskMap.ts)
 *
 * This guard keys on the *derivation*, not on a raw `first_tiny_step` grep
 * (that field is also written legitimately by parse and by the FR-023 gate's
 * user edit). It fails if any OTHER production source turns node/map data
 * into `first_tiny_step` — either by calling the shared resolver, or by
 * co-writing `first_tiny_step` alongside a `progression_map` write (a
 * hand-rolled map->field derivation or a background sync). No back-sync from
 * a field edit into the map is F4's job either — that is F5.
 */

const repoRoot = resolve(__dirname, "../../../..");
const RESOLVER_DEFINITION = "apps/web/src/lib/taskmap/graph.ts";
const APPROVE_WRITERS = [
  "apps/web/src/lib/data/workflow/taskMap.ts",
  "apps/web/src/lib/workflow/taskMap.ts",
].sort();

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

// Non-test production source files under apps/web/src.
function productionSourceFiles() {
  return walkRepoFiles("apps/web/src").filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(f) &&
      !f.includes("__tests__"),
  );
}

describe("FR-023 first_tiny_step identity — single derivation site", () => {
  it("uses the shared resolver only in the two approve paths", () => {
    const callers = productionSourceFiles().filter((f) => {
      if (f === RESOLVER_DEFINITION) {
        return false;
      }
      return /resolveFirstStepNode\s*\(/.test(readRepoFile(f));
    });

    expect(
      callers.sort(),
      [
        "resolveFirstStepNode (the sole first-node -> first_tiny_step",
        "derivation) may be called only by the approve paths. A new call site",
        "means a second writer of the identity. Offending files:",
        callers.join(", "),
      ].join("\n"),
    ).toEqual(APPROVE_WRITERS);
  });

  it("co-writes first_tiny_step with the map only in the two approve paths", () => {
    const mapDerivedWriters = productionSourceFiles().filter((f) => {
      const content = readRepoFile(f);
      return (
        /first_tiny_step\s*:/.test(content) &&
        /progression_map\s*:/.test(content)
      );
    });

    expect(
      mapDerivedWriters.sort(),
      [
        "first_tiny_step must be derived from the map ONLY in the same update",
        "as progression_map, and ONLY in the two approve paths (FR-023",
        "identity, no background sync). Offending files:",
        mapDerivedWriters.join(", "),
      ].join("\n"),
    ).toEqual(APPROVE_WRITERS);
  });

  it("keeps the derivation real: each approve writer pairs the resolver with the write", () => {
    for (const writer of APPROVE_WRITERS) {
      const content = readRepoFile(writer);
      expect(content).toMatch(/resolveFirstStepNode\s*\(/);
      expect(content).toMatch(/first_tiny_step\s*:/);
    }
  });
});
