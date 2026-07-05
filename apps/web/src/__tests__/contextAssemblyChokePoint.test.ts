import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NS-INV-1 guard — one context-assembly choke point (issue #254).
 *
 * All AI prompt construction and personalization-context injection (area
 * charter, operator profile, and later rollups / people context) must live in
 * the single module `apps/web/src/lib/ai/contextAssembly.ts`. This guard fails
 * if the prompt-construction marker (the system-prompt sentinel or a
 * `role: "system"` message-object assembly) appears in any other non-test
 * source file, or if the choke-point module ever stops constructing prompts.
 *
 * The guard keys on the *construction* marker, not on the
 * `buildParseCaptureMessages` symbol, so legitimate callers (e.g.
 * `parseCapture.ts`) that merely invoke the choke point do not trip it.
 */

const repoRoot = resolve(__dirname, "../../../..");
const CHOKE_POINT = "apps/web/src/lib/ai/contextAssembly.ts";

// The system-prompt sentinel is a stable, distinctive first line of the parse
// prompt. Any file that embeds it is constructing prompt text.
const SYSTEM_PROMPT_SENTINEL = "You parse one private LifeOS capture";

// A structural marker for assembling chat message objects with a system role.
const SYSTEM_ROLE_ASSEMBLY = /role:\s*["']system["']/;

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

// Non-test source files under apps/web/src, matching the INV-3 vendor-seam
// filtering so fixtures/specs that legitimately exercise the choke point are
// not treated as construction sites.
function productionSourceFiles() {
  return walkRepoFiles("apps/web/src").filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(f) &&
      !f.includes("__tests__"),
  );
}

describe("NS-INV-1 context-assembly choke point", () => {
  it("constructs the parse prompt only inside contextAssembly.ts", () => {
    const violations = productionSourceFiles().filter((f) => {
      if (f === CHOKE_POINT) {
        return false;
      }

      const content = readRepoFile(f);
      return (
        content.includes(SYSTEM_PROMPT_SENTINEL) ||
        SYSTEM_ROLE_ASSEMBLY.test(content)
      );
    });

    expect(
      violations,
      [
        "AI prompt construction must live only in apps/web/src/lib/ai/contextAssembly.ts",
        "(NS-INV-1). Route prompt/personalization context through that module instead",
        `of assembling messages here. Offending files: ${violations.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("keeps the choke-point module as the actual construction site", () => {
    const content = readRepoFile(CHOKE_POINT);

    expect(content).toContain(SYSTEM_PROMPT_SENTINEL);
    expect(content).toMatch(SYSTEM_ROLE_ASSEMBLY);
  });
});
