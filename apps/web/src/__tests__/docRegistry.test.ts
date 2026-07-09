import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

/**
 * Canonical documentation registry guard (issue #228).
 *
 * Every `.md` file in the repo must be either on the canonical allowlist
 * below or listed in the grandfather snapshot `docs/doc-registry.json`.
 * The snapshot is shrink-only: entries may be removed when files are
 * deleted, but new files may never be added to it.
 *
 * Where content belongs instead of a new `.md` file:
 * - Durable decisions -> `docs/adr/`
 * - Status / current-state changes -> `docs/PROJECT_STATE.md`
 * - Agent procedures -> `.agents/skills/`
 * - Everything else -> git history (commit messages, PR descriptions)
 */
const CANONICAL_ALLOWLIST_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "SECURITY.md",
  "PRODUCT.md",
  "BUILD_BACKLOG.md",
  "EXTRA_INFO_AND_RULES.md",
  "docs/REQUIREMENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/ENGINEERING_INVARIANTS.md",
  "docs/UX_FLOWS.md",
  "docs/SECURITY_PRIVACY.md",
  "docs/TEST_PLAN.md",
  "docs/KNOWN_ISSUES.md",
  "docs/FAILURES.md",
  "docs/PLAYS.md",
  "docs/SYSTEM_MAP.md",
  "docs/PROJECT_STATE.md",
  "docs/OBSERVABILITY_RUNBOOK.md",
  "docs/VERCEL_PRODUCTION_CHECKLIST.md",
  "docs/agent/CODEX_PROMPT_TEMPLATE.md",
  "docs/agent/HANDOVER.md",
  "docs/vision/vision-fable-final-pass.md",
  "docs/vision/vision-fable-deeper-pass.md",
  "docs/vision/vision-fable-wider-pass.md",
  "docs/vision/vision-fable-horizon-pass.md",
  "docs/vision/vision-execution-companion.md",
  "docs/vision/README-VISION-INDEX.md",
  "docs/vision/THE-METHOD-self-sustaining-systems.md",
  "docs/vision/THE-METHOD-companion-templates.md",
  "docs/implementation-planning/plan-moments-shell.md",
  "docs/implementation-planning/plan-daily-driver-floor.md",
  "docs/implementation-planning/plan-subtle-polish.md",
  "docs/implementation-planning/plan-coherence-framework.md",
  "docs/implementation-planning/plan-task-map-contract.md",
  "docs/implementation-planning/plan-dual-critical-path.md",
  "docs/implementation-planning/U3-live-in-it-onramp.md",
]);

const CANONICAL_ALLOWLIST_PATTERNS = [
  /^docs\/adr\/[^/]+\.md$/,
  /^\.agents\/skills\/.+\.md$/,
  /^\.cursor\/.+\.md$/,
  /^\.github\/.+\.md$/,
];

/**
 * Combined `AGENTS.md` + `CLAUDE.md` line budget.
 *
 * This constant may ONLY ever be DECREASED. Never raise it to make the
 * test pass — trim the entry files instead. Content that does not fit:
 * decisions go to `docs/adr/`, status goes to `docs/PROJECT_STATE.md`,
 * procedures go to `.agents/skills/`. Issue A4 ratchets this to 250.
 */
const ENTRY_FILE_LINE_BUDGET = 250;

const IGNORED_SCAN_DIRECTORIES = new Set([
  ".git",
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

function walkMarkdownFiles(relativePath: string): string[] {
  const currentPath =
    relativePath === "" ? repoRoot : resolve(repoRoot, relativePath);

  return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath =
      relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;

    if (entry.isDirectory()) {
      if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
        return [];
      }

      return walkMarkdownFiles(nextRelativePath);
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      return [];
    }

    return [nextRelativePath];
  });
}

function isAllowlisted(path: string): boolean {
  return (
    CANONICAL_ALLOWLIST_EXACT.has(path) ||
    CANONICAL_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(path))
  );
}

function readGrandfatheredPaths(): string[] {
  const registry = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/doc-registry.json"), "utf8"),
  ) as { grandfathered: string[] };

  return registry.grandfathered;
}

function countLines(path: string): number {
  return readFileSync(resolve(repoRoot, path), "utf8").split(/\r?\n/).length;
}

describe("doc registry", () => {
  it("keeps every markdown file allowlisted or grandfathered", () => {
    const markdownFiles = walkMarkdownFiles("").sort();
    const grandfathered = new Set(readGrandfatheredPaths());
    const unregistered = markdownFiles.filter(
      (path) => !isAllowlisted(path) && !grandfathered.has(path),
    );

    expect(
      unregistered,
      [
        "New markdown files are not allowed. Do NOT create per-session note files,",
        "and do NOT add entries to docs/doc-registry.json (it is shrink-only).",
        "Put the content where it belongs instead:",
        "  - durable decisions -> docs/adr/",
        "  - status / current-state changes -> docs/PROJECT_STATE.md",
        "  - agent procedures -> .agents/skills/",
        "  - everything else -> git history (commit messages, PR descriptions).",
        "If a genuinely new canonical doc is required, add it deliberately to the",
        "allowlist in apps/web/src/__tests__/docRegistry.test.ts with reviewer sign-off.",
        `Offending files: ${unregistered.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("removes deleted files from the grandfather snapshot", () => {
    const markdownFiles = new Set(walkMarkdownFiles(""));
    const stale = readGrandfatheredPaths().filter(
      (path) => !markdownFiles.has(path),
    );

    expect(
      stale,
      `docs/doc-registry.json lists files that no longer exist. Remove these entries (the registry is shrink-only): ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps AGENTS.md + CLAUDE.md within the entry-file line budget", () => {
    const combined = countLines("AGENTS.md") + countLines("CLAUDE.md");

    expect(
      combined,
      [
        `AGENTS.md + CLAUDE.md combined line count (${combined}) exceeds the budget`,
        `(${ENTRY_FILE_LINE_BUDGET}). Do NOT raise ENTRY_FILE_LINE_BUDGET — it may only`,
        "ever decrease. Trim the entry files instead: durable decisions -> docs/adr/,",
        "status -> docs/PROJECT_STATE.md, procedures -> .agents/skills/.",
      ].join("\n"),
    ).toBeLessThanOrEqual(ENTRY_FILE_LINE_BUDGET);
  });
});
