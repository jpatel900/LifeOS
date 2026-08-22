import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertWalkFoundFiles, readDirCached } from "./helpers/repoWalk";

vi.setConfig({ testTimeout: 30_000 });

const repoRoot = resolve(__dirname, "../../../..");

/**
 * Doc link + status integrity guard (2026-08-04 docs cleanup).
 *
 * The August 2026 documentation audit found ~60 rot instances with four
 * mechanical root classes. Each test below pins one class shut:
 *   1. Docs referencing repo paths that do not exist (deleted files kept
 *      being cited in mandatory reading ladders).
 *   2. Duplicate ADR numbers (two ADRs shared "0002" for a month).
 *   3. Plan/program docs with no STATUS header (readers could not tell a
 *      live contract from a historical snapshot).
 *   4. The same FR number carrying different titles in different docs
 *      (the FR-022 collision), and model names leaking outside the one
 *      file allowed to carry them (docs/agent/MODEL_LANES.md).
 *
 * Scope: live doc surfaces only. docs/_archive/** is frozen history and
 * exempt from everything except existing at all.
 */

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
  "worktrees",
  "_archive",
]);

function walkMarkdownFiles(
  absoluteDir: string,
  relativePath: string,
): string[] {
  return readDirCached(absoluteDir).flatMap((entry) => {
    const nextRelativePath =
      relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) return [];
      return walkMarkdownFiles(
        resolve(absoluteDir, entry.name),
        nextRelativePath,
      );
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    return [nextRelativePath];
  });
}

function listLiveDocFiles(): string[] {
  const docsFiles = walkMarkdownFiles(resolve(repoRoot, "docs"), "docs");
  const rootFiles = readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
  const files = [...rootFiles, ...docsFiles].sort();
  // Anti-vacuum: docs/ + root markdown totals 60+ files today; a renamed
  // docs directory would otherwise make every assertion built on this list
  // (path existence, FR-title collisions) pass on zero docs scanned.
  assertWalkFoundFiles(files, "docLinkIntegrity: docs/**/*.md + root *.md", 20);
  return files;
}

/**
 * Historical docs (STATUS: COMPLETE / SUPERSEDED / HISTORICAL / REFERENCE)
 * accumulate dead paths by design as code moves on — their header already
 * warns the reader. Chronicles (FAILURES, KNOWN_ISSUES) legitimately cite
 * deleted files ("removed X"). The link guarantee binds LIVE docs only.
 */
const CHRONICLE_DOCS = new Set(["docs/FAILURES.md", "docs/KNOWN_ISSUES.md"]);

function isHistoricalDoc(path: string): boolean {
  const head = readFileSync(resolve(repoRoot, path), "utf8")
    .split(/\r?\n/)
    .slice(0, 10)
    .join("\n");
  return /STATUS:.*(COMPLETE|SUPERSEDED|HISTORICAL|REFERENCE|RESERVED)/i.test(
    head,
  );
}

describe("doc link integrity", () => {
  it("every repo path a live doc references exists", () => {
    // Backtick-quoted tokens that look like repo-relative file paths.
    const PATH_PATTERN =
      /`((?:docs|apps|packages|scripts|supabase|\.github|\.agents|\.cursor)\/[A-Za-z0-9_\-./[\]]+\.[a-z]{2,4})`/g;
    const missing: { doc: string; ref: string }[] = [];

    const liveDocs = listLiveDocFiles().filter(
      (doc) => !CHRONICLE_DOCS.has(doc) && !isHistoricalDoc(doc),
    );
    for (const doc of liveDocs) {
      const content = readFileSync(resolve(repoRoot, doc), "utf8");
      for (const match of content.matchAll(PATH_PATTERN)) {
        const ref = match[1];
        // Globs, placeholders, and bracketed segments are not literal paths.
        if (ref.includes("*") || ref.includes("<") || ref.includes("["))
          continue;
        if (!existsSync(resolve(repoRoot, ref))) {
          missing.push({ doc, ref });
        }
      }
    }

    expect(
      missing,
      [
        "Live docs reference repo paths that do not exist. Fix the doc (or,",
        "if the file moved, point at the successor). Deleting a file means",
        "sweeping its references in the same PR.",
        `Missing: ${JSON.stringify(missing, null, 2)}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("ADR numbers are unique", () => {
    const numbers = readdirSync(resolve(repoRoot, "docs/adr"))
      .filter((name) => /^\d{4}-.+\.md$/.test(name))
      .map((name) => name.slice(0, 4));
    const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);

    expect(
      duplicates,
      `Duplicate ADR numbers: ${duplicates.join(", ")}. Renumber the newer file and leave a renumber note in its Status line.`,
    ).toEqual([]);
  });

  it("program and implementation-planning docs declare a STATUS", () => {
    const requireStatusIn = ["docs/program", "docs/implementation-planning"];
    const offenders: string[] = [];

    for (const dir of requireStatusIn) {
      const files = walkMarkdownFiles(resolve(repoRoot, dir), dir);
      // Anti-vacuum: each of these directories carries live docs today; a
      // renamed directory would otherwise make the STATUS-header check pass
      // on zero files scanned for that directory.
      assertWalkFoundFiles(files, `docLinkIntegrity STATUS check: ${dir}`, 1);
      for (const file of files) {
        const head = readFileSync(resolve(repoRoot, file), "utf8")
          .split(/\r?\n/)
          .slice(0, 10)
          .join("\n");
        if (!/STATUS/i.test(head)) offenders.push(file);
      }
    }

    expect(
      offenders,
      [
        "Every program/planning doc opens with a STATUS marker (LIVE /",
        "RATIFIED / IN FLIGHT / COMPLETE / SUPERSEDED / HISTORICAL /",
        "REFERENCE) in its first 10 lines, so a reader can tell a live",
        `contract from a snapshot. Missing: ${offenders.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("one FR number never carries two different titles", () => {
    const FR_HEADING = /^###\s+(FR-\d{3})\s*(?:\(reserved\))?\s*—\s*(.+)$/gm;
    const titlesByNumber = new Map<string, Map<string, string[]>>();

    const frDocs = listLiveDocFiles().filter((doc) => !isHistoricalDoc(doc));
    for (const doc of frDocs) {
      const content = readFileSync(resolve(repoRoot, doc), "utf8");
      for (const match of content.matchAll(FR_HEADING)) {
        const number = match[1];
        const title = match[2]
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, "");
        const perNumber = titlesByNumber.get(number) ?? new Map();
        perNumber.set(title, [...(perNumber.get(title) ?? []), doc]);
        titlesByNumber.set(number, perNumber);
      }
    }

    const conflicts = [...titlesByNumber.entries()]
      .filter(([, titles]) => titles.size > 1)
      .map(([number, titles]) => ({ number, titles: [...titles.entries()] }));

    expect(
      conflicts,
      [
        "The same FR number appears with different titles in different docs",
        "(the FR-022 collision class). Align the non-REQUIREMENTS doc to the",
        `title in docs/REQUIREMENTS.md. Conflicts: ${JSON.stringify(conflicts, null, 2)}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("model names appear only in docs/agent/MODEL_LANES.md on live governance surfaces", () => {
    // Live governance surfaces: entry files + program + agent docs. Historical
    // plans, audits, and vision docs may quote model names as provenance.
    const programDocs = walkMarkdownFiles(
      resolve(repoRoot, "docs/program"),
      "docs/program",
    );
    const agentDocs = walkMarkdownFiles(
      resolve(repoRoot, "docs/agent"),
      "docs/agent",
    );
    // Anti-vacuum: the 3 fixed root files always get scanned regardless, so
    // without this a renamed docs/program or docs/agent directory would
    // silently drop out of scope while the test kept passing on the 3 roots
    // alone.
    assertWalkFoundFiles(
      programDocs,
      "docLinkIntegrity model-name scope: docs/program",
      1,
    );
    assertWalkFoundFiles(
      agentDocs,
      "docLinkIntegrity model-name scope: docs/agent",
      1,
    );
    const scopes = [
      "AGENTS.md",
      "CLAUDE.md",
      "README.md",
      ...programDocs,
      ...agentDocs,
    ].filter((path) => path !== "docs/agent/MODEL_LANES.md");
    const MODEL_TOKENS =
      /\b(opus|sonnet|haiku|fable|gpt-\d|o[13]-\w+|gemini)\b/i;
    const offenders: { doc: string; match: string }[] = [];

    for (const doc of scopes) {
      // Backtick spans and markdown link targets are file paths/identifiers
      // (e.g. a vision filename that happens to contain a model name), not
      // lane assignments. Prose stays fully checked.
      const content = readFileSync(resolve(repoRoot, doc), "utf8")
        .replace(/`[^`\n]*`/g, "")
        .replace(/\]\([^)\n]*\)/g, "]");
      const match = content.match(MODEL_TOKENS);
      if (match) offenders.push({ doc, match: match[0] });
    }

    expect(
      offenders,
      [
        "Model names on live governance surfaces belong ONLY in",
        "docs/agent/MODEL_LANES.md — use role names (driver, implementer,",
        `verifier, judge) everywhere else. Found: ${JSON.stringify(offenders)}`,
      ].join("\n"),
    ).toEqual([]);
  });
});
