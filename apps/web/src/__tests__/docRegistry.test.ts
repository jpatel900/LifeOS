import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

/**
 * Canonical documentation registry guard (issue #228).
 *
 * Every `.md` file *tracked by git* must be either on the canonical
 * allowlist below or listed in the grandfather snapshot
 * `docs/doc-registry.json`. The snapshot is shrink-only: entries may be
 * removed when files are deleted, but new files may never be added to it.
 *
 * The scan (`listTrackedMarkdownFiles`, issue #867) covers git-tracked files
 * only, via `git ls-files`. Untracked local scratch `.md` files (e.g. an
 * agent's own `WORKPLAN.md` sitting in the worktree) are deliberately
 * ignored — they never enter the repo, so they are not this guard's concern.
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
  // Role→model mapping (owner mandate 2026-08-04): the ONE file where model
  // names may appear; every other doc uses role names.
  "docs/agent/MODEL_LANES.md",
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
  // Owner-commissioned external UX audit (2026-07-13), preserved verbatim as
  // the canonical debt source for epic #555; added under the owner's active
  // continuous-loop order (owner directive: take this audit seriously).
  "docs/design/ux-audit-2026-07-13-codex.md",
  // Audit #2 (2026-07-26): the standing post-milestone re-run of the audit
  // above against remediated main, same eleven dimensions and scale (#586).
  "docs/design/ux-audit-2026-07-26-fable.md",
  // Epic #555 item-1 design note (one shell / one renderer per URL).
  "docs/implementation-planning/plan-one-shell-routing.md",
  // In-flight lane ledger for the two-harness (Claude + Codex) parallel
  // workstreams — owner directive 2026-07-13. Both lanes check it before
  // starting a slice; it lists per-slice file manifests to prevent collisions.
  "docs/agent/LANES.md",
  // Parked-capability catalog (ADR 0009): rows are append-only, added in the
  // same PR that attics the code they describe.
  "docs/ATTIC.md",
  // Epic #555 item-4 design note (one planning model — placement wins),
  // ratified by the owner decision 2026-07-14.
  "docs/implementation-planning/plan-one-planning-model.md",
  // Epic #555 item-7 design note (onboarding ritual), content delegated to
  // Claude by the owner 2026-07-14; owner reviews the built result.
  "docs/implementation-planning/plan-onboarding-ritual.md",
]);

const CANONICAL_ALLOWLIST_PATTERNS = [
  /^docs\/adr\/[^/]+\.md$/,
  // Governing-program docs (owner mandate 2026-08-04: one truth store — the
  // active program lives in the repo, not in out-of-repo planning folders).
  /^docs\/program\/[^/]+\.md$/,
  // Archived pilot-era docs (owner mandate 2026-08-04): historical, frozen,
  // excluded from formatting; agents skip this folder.
  /^docs\/_archive\/[^/]+\.md$/,
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

/**
 * Lists every `.md` file git tracks in the repo, as repo-relative paths with
 * forward slashes — the same format the allowlist and grandfather snapshot
 * use. `git ls-files` is authoritative for repo content and is a single fast
 * call, unlike a recursive filesystem walk (issue #867).
 */
function listTrackedMarkdownFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return output.split("\0").filter((path) => path.length > 0);
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
    const markdownFiles = listTrackedMarkdownFiles().sort();
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
    const markdownFiles = new Set(listTrackedMarkdownFiles());
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

  /**
   * The probe lives in its own repo-root subdirectory, never directly in the
   * repo root. Two sibling guards (`docLinkIntegrity`, `publicEvidenceHygiene`)
   * list the repo root with `readdirSync` and then read every root-level `*.md`
   * they find. Vitest runs test files in parallel workers, so a root-level
   * probe can be listed by one of those scans and deleted by the `finally`
   * below before that scan reads it -- an ENOENT failure surfacing in an
   * unrelated test file (observed once in a full `pnpm test` run, 2026-08-22;
   * reproduced deterministically by flipping a root probe on and off while
   * those two guards run). Both scans only take `entry.isFile()` at the root,
   * so a subdirectory is invisible to them. Do not move this probe back to the
   * repo root.
   *
   * Two properties keep the assertion meaningful, and the git-status check
   * below pins both: the probe must sit INSIDE the working tree (`git ls-files`
   * could never list a path outside it, so `not.toContain` would pass
   * vacuously), and it must be untracked but NOT gitignored (`git ls-files`
   * omits ignored files for a different reason than the one under test).
   */
  it("ignores untracked local scratch markdown files", () => {
    const probeDirectoryRelativePath = ".doc-registry-probe";
    const probeRelativePath = `${probeDirectoryRelativePath}/untracked-probe.md`;
    const probeAbsolutePath = resolve(repoRoot, probeRelativePath);

    try {
      mkdirSync(resolve(repoRoot, probeDirectoryRelativePath), {
        recursive: true,
      });
      writeFileSync(
        probeAbsolutePath,
        "# untracked probe\n\nThis file is never committed.\n",
      );

      const probeStatus = execFileSync(
        "git",
        ["status", "--porcelain", "-uall", "--", probeRelativePath],
        { cwd: repoRoot, encoding: "utf8" },
      ).trim();

      expect(
        probeStatus,
        [
          "The probe must be untracked and not gitignored for this test to mean",
          `anything, but git reported "${probeStatus}" instead of`,
          `"?? ${probeRelativePath}". If ${probeDirectoryRelativePath} was added to`,
          ".gitignore, this test would only prove that git ls-files skips ignored",
          "files -- not that it skips untracked ones.",
        ].join(" "),
      ).toBe(`?? ${probeRelativePath}`);

      const markdownFiles = listTrackedMarkdownFiles();

      expect(markdownFiles).not.toContain(probeRelativePath);
    } finally {
      rmSync(resolve(repoRoot, probeDirectoryRelativePath), {
        recursive: true,
        force: true,
      });
    }
  });
});
