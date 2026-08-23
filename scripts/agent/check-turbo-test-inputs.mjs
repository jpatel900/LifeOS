#!/usr/bin/env node

// Guards the guard for the turbo cache-key gap found 2026-08-21 (docs/FAILURES.md):
// several apps/web vitest suites (publicEvidenceHygiene.test.ts,
// docRegistry.test.ts, coherenceRegistry.test.ts, docLinkIntegrity.test.ts,
// supabaseMigration.test.ts, and others) read repo-root paths OUTSIDE
// apps/web/** -- docs/**, supabase/**, root markdown/config, .github/,
// .agents/, .cursor/, scripts/ -- to enforce repo-wide invariants (the
// public-evidence-hygiene guard is what caught a live Supabase project ref
// leaking into docs/FAILURES.md).
//
// Turbo's default task `inputs` (when omitted, as this repo's turbo.json
// originally had it) only hash files inside the task's own package
// directory. A docs-only edit never changed `@lifeos/web#test`'s cache key,
// so CI could replay a stale cached PASS while the guard's premise had
// actually changed -- the same silent-vacuous-pass class as the knip/
// depcruise-era incidents in docs/FAILURES.md. turbo.json's `test` task now
// lists explicit `$TURBO_ROOT$` inputs for every repo-root path these guards
// read; this script re-derives that requirement from the guard tests'
// ACTUAL source (not a hand-maintained guess) so a future edit that starts
// scanning a new repo-root directory -- or a turbo.json edit that drops
// coverage -- fails loudly instead of silently reopening the gap.
//
// Two run modes:
//   (no flags)     real check against this repo's current turbo.json and
//                  apps/web/src test tree. Wired into the "Monorepo
//                  Validation" job so it runs on every PR.
//   --self-test    pins the pure parsing/matching functions against
//                  synthetic fixtures (no repo I/O). Wired into the
//                  "Safe-automerge policy self-tests" job, extending the
//                  same pattern the migration-drift lane just used for
//                  check-migration-drift.mjs -- not a parallel mechanism.
//
// Dependency-free by design, like the other scripts/agent policy scripts, so
// neither CI job needs to install anything to run this.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_SCAN_ROOT = resolve(REPO_ROOT, "apps/web/src");
const TURBO_JSON_PATH = resolve(REPO_ROOT, "turbo.json");

// Covered by turbo's task-dependency graph (`dependsOn: ["^build"]`, since
// both are real workspace packages with a `build` task) or, for apps/web
// itself, by `$TURBO_DEFAULT$` -- never this guard's job to also list as a
// $TURBO_ROOT$ input.
const WORKSPACE_TOP_LEVEL_DIRS = new Set(["apps", "packages"]);

const TEST_FILE_PATTERN = /\.test\.(ts|tsx)$/;

// ---------------------------------------------------------------------------
// Pure: repo-tree / source-text parsing
// ---------------------------------------------------------------------------

export function listTestFiles(absoluteDir, readdir = readdirSync) {
  const results = [];
  for (const entry of readdir(absoluteDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = resolve(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTestFiles(full, readdir));
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Same idiom as plainLanguageGuard/coherenceRegistry's stripCommentsForTokenScan:
 * strip comments before scanning so a markdown code-span inside a JSDoc
 * comment (e.g. `` `.agents/skills/` `` in docRegistry.test.ts's own header)
 * never masquerades as a real string literal. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const RESOLVE_REPOROOT = /\bresolve\(\s*repoRoot\s*,\s*([^)]+)\)/g;
const FIRST_QUOTED = /["'`]([^"'`]+)["'`]/;
const RESOLVE_DIRNAME_OR_CWD =
  /\bresolve\(\s*(?:process\.cwd\(\)|__dirname)\s*,\s*["'`]([^"'`]+)["'`]/g;

/**
 * Extracts the repo-root-relative top-level path segment ("docs", "supabase",
 * ".env.example", ...) from every direct-literal `resolve(repoRoot, "...")`
 * or repo-root-escaping `resolve(__dirname/process.cwd(), "../../.../...")`
 * call in one test file's (comment-stripped) source. Only the FIRST quoted
 * argument of a multi-arg `resolve(repoRoot, "a", "b", "c")` call is used --
 * those extra args are nested path components of the SAME read (e.g.
 * columnMigrationDrift.test.ts's `resolve(repoRoot, "supabase", "migrations")`
 * is one read of supabase/migrations, not two independent top-level reads.
 */
export function extractDirectRepoRootSegments(source) {
  const segments = new Set();

  for (const match of source.matchAll(RESOLVE_REPOROOT)) {
    const firstQuoted = match[1].match(FIRST_QUOTED);
    if (!firstQuoted) continue;
    const segment = firstQuoted[1].split("/")[0];
    if (segment) segments.add(segment);
  }

  for (const match of source.matchAll(RESOLVE_DIRNAME_OR_CWD)) {
    let rest = match[1];
    let climbed = false;
    while (rest.startsWith("../")) {
      rest = rest.slice(3);
      climbed = true;
    }
    // No climbing above the file's own directory -> an in-package path, not
    // a repo-root escape; nothing to require coverage for. A remainder of
    // only dots (e.g. the trailing ".." left by a bare
    // `resolve(__dirname, "../../../..")` repoRoot definition, which has no
    // filename after the climb) names no file either.
    if (!climbed || /^\.*$/.test(rest)) continue;
    const segment = rest.split("/")[0];
    if (segment) segments.add(segment);
  }

  return segments;
}

// docLinkIntegrity.test.ts's PATH_PATTERN names every top-level prefix its
// existsSync check will ever look under, e.g.:
//   /`((?:docs|apps|packages|scripts|supabase|\.github|\.agents|\.cursor)\/...
// Parsing this directly (rather than hand-copying the list into this script)
// means a future edit that adds a new prefix there is caught automatically --
// this is what makes `scripts`, `.github`, `.agents`, `.cursor` require
// coverage even though no test has a literal `resolve(repoRoot, "scripts/...")`
// call: the paths actually checked are extracted from doc CONTENT at runtime,
// matched against this allowlist of prefixes.
const PATH_PATTERN_ALTERNATION = /\(\?:([a-zA-Z0-9_.\\|]+)\)\\\//;

export function extractPathPatternAlternatives(source) {
  const match = source.match(PATH_PATTERN_ALTERNATION);
  if (!match) return [];
  return match[1]
    .split("|")
    .map((alt) => alt.replace(/\\/g, ""))
    .filter(Boolean);
}

// docRegistry.test.ts's `listTrackedMarkdownFiles` scans EVERY git-tracked
// `.md` file repo-wide (`git ls-files -- "*.md"`), not just docs/** or root
// files -- it is what asserts .agents/skills/**/*.md, .cursor/**/*.md, and
// .github/**/*.md are canonical-allowlisted or grandfathered. Detecting the
// `ls-files` + `"*.md"` combination means a blanket `$TURBO_ROOT$/**/*.md`
// input is required rather than a curated per-directory list.
export function detectsRepoWideMarkdownScan(source) {
  return /ls-files/.test(source) && /["'`]\*\.md["'`]/.test(source);
}

// ---------------------------------------------------------------------------
// Pure: turbo.json inputs parsing + coverage check
// ---------------------------------------------------------------------------

/** Minimal JSONC comment stripper: removes `//` and `/* *\/` outside of
 * string literals (turbo.json is JSONC -- `next typegen`-adjacent tooling
 * across this repo already tolerates it, and turbo itself parses it). */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let stringQuote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 1;
        continue;
      }
      if (ch === stringQuote) inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringQuote = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 1; // land on the trailing '/'
      out += " ";
      continue;
    }

    out += ch;
  }
  return out;
}

export function loadTurboTestInputs(turboJsonText) {
  const config = JSON.parse(stripJsonComments(turboJsonText));
  return config.tasks?.test?.inputs ?? [];
}

export function isDirectoryCovered(segment, inputs) {
  return inputs.includes(`$TURBO_ROOT$/${segment}/**`);
}

export function isExactFileCovered(segment, inputs) {
  return inputs.includes(`$TURBO_ROOT$/${segment}`);
}

export function isRepoWideMarkdownCovered(inputs) {
  return inputs.includes("$TURBO_ROOT$/**/*.md");
}

/**
 * Combines everything discovered across every test file into one coverage
 * verdict: which required directories/files turbo.json's `test.inputs`
 * is missing.
 */
export function computeMissingCoverage({
  requiredSegments,
  requiresRepoWideMarkdown,
  isRealDirectory,
  turboInputs,
}) {
  const missingDirs = [];
  const missingFiles = [];

  for (const segment of [...requiredSegments].sort()) {
    if (WORKSPACE_TOP_LEVEL_DIRS.has(segment)) continue;
    if (isRealDirectory(segment)) {
      if (!isDirectoryCovered(segment, turboInputs)) missingDirs.push(segment);
    } else if (!isExactFileCovered(segment, turboInputs)) {
      missingFiles.push(segment);
    }
  }

  const missingMd =
    requiresRepoWideMarkdown && !isRepoWideMarkdownCovered(turboInputs);

  return { missingDirs, missingFiles, missingMd };
}

// ---------------------------------------------------------------------------
// Real check (reads this repo's actual turbo.json + apps/web/src test tree)
// ---------------------------------------------------------------------------

function runRealCheck() {
  const realTopLevelEntries = new Set(
    readdirSync(REPO_ROOT, { withFileTypes: true }).map((entry) => entry.name),
  );
  const isRealDirectory = (segment) => {
    const path = resolve(REPO_ROOT, segment);
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  };

  const requiredSegments = new Set();
  let requiresRepoWideMarkdown = false;

  for (const file of listTestFiles(TEST_SCAN_ROOT)) {
    const source = stripComments(readFileSync(file, "utf8"));

    for (const segment of extractDirectRepoRootSegments(source)) {
      if (realTopLevelEntries.has(segment)) requiredSegments.add(segment);
    }
    for (const alt of extractPathPatternAlternatives(source)) {
      if (realTopLevelEntries.has(alt)) requiredSegments.add(alt);
    }
    if (detectsRepoWideMarkdownScan(source)) requiresRepoWideMarkdown = true;
  }

  // Anti-vacuum: a broken/rewritten scan that silently found nothing would
  // make the coverage check below pass vacuously.
  assert.ok(
    requiredSegments.size >= 2,
    `Static scan found only ${requiredSegments.size} repo-root segment(s) read by apps/web tests -- expected at least 2 (docs, supabase). The scan in this script is probably broken; fix it rather than trusting a suspiciously clean result.`,
  );

  const turboInputs = loadTurboTestInputs(
    readFileSync(TURBO_JSON_PATH, "utf8"),
  );
  const { missingDirs, missingFiles, missingMd } = computeMissingCoverage({
    requiredSegments,
    requiresRepoWideMarkdown,
    isRealDirectory,
    turboInputs,
  });

  if (missingDirs.length === 0 && missingFiles.length === 0 && !missingMd) {
    console.log(
      `turbo.json's \`test\` task inputs cover every repo-root path the apps/web guard tests read (${requiredSegments.size} top-level segment(s) checked, repo-wide markdown scan ${requiresRepoWideMarkdown ? "covered" : "not required"}).`,
    );
    return;
  }

  console.error(
    [
      "turbo.json's `test` task inputs are missing coverage for repo-root paths",
      "an apps/web guard test actually reads. A docs-only (or scripts-only, etc.)",
      "change could hit a stale cached PASS while the guard's premise changed --",
      "see docs/FAILURES.md and the turbo.json comment above the `test` task.",
      "",
      ...missingDirs.map(
        (segment) => `  missing directory input: "$TURBO_ROOT$/${segment}/**"`,
      ),
      ...missingFiles.map(
        (segment) => `  missing file input: "$TURBO_ROOT$/${segment}"`,
      ),
      ...(missingMd
        ? [
            '  missing blanket input: "$TURBO_ROOT$/**/*.md" (docRegistry.test.ts scans every git-tracked *.md repo-wide)',
          ]
        : []),
    ].join("\n"),
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-test (synthetic fixtures only, no repo I/O)
// ---------------------------------------------------------------------------

function runSelfTest() {
  // extractDirectRepoRootSegments
  {
    const source = [
      'const repoRoot = resolve(__dirname, "../../../..");',
      'const a = resolve(repoRoot, "docs/coherence-registry.json");',
      'const b = resolve(repoRoot, "supabase", "migrations");',
      'const c = resolve(repoRoot, "apps/web/src/app/globals.css");',
    ].join("\n");
    const segments = extractDirectRepoRootSegments(source);
    assert.deepEqual(
      [...segments].sort(),
      ["apps", "docs", "supabase"],
      "multi-arg resolve(repoRoot, ...) should yield only the first arg's top segment, not every arg",
    );
  }

  {
    const source =
      'const envExample = readFileSync(resolve(__dirname, "../../../../../.env.example"), "utf8");';
    const segments = extractDirectRepoRootSegments(source);
    assert.deepEqual(
      [...segments],
      [".env.example"],
      "a repo-root-escaping resolve(__dirname, ...) literal should surface the file after stripping leading ../ segments",
    );
  }

  {
    // This function cannot know a test file's depth, so it cannot tell a
    // package-internal single-level climb from a genuine repo-root escape by
    // itself -- it surfaces every climbing literal's top segment as a
    // candidate. The real safety net is downstream: runRealCheck only
    // requires turbo.json coverage for a candidate that ALSO matches a real
    // repo-root top-level entry name (via realTopLevelEntries.has(segment)),
    // so an in-package climb like this one is harmlessly dropped there
    // because no top-level "fixtures" directory exists at the repo root.
    const source =
      'const sibling = resolve(__dirname, "../fixtures/sample.json");';
    const segments = extractDirectRepoRootSegments(source);
    assert.deepEqual([...segments], ["fixtures"]);
  }

  // stripComments prevents JSDoc code-spans from being read as literals
  {
    const source = [
      "/**",
      " * procedures go to `.agents/skills/`.",
      " */",
      'const repoRoot = resolve(__dirname, "../../../..");',
      'const x = resolve(repoRoot, "docs");',
    ].join("\n");
    const segments = extractDirectRepoRootSegments(stripComments(source));
    assert.deepEqual(
      [...segments],
      ["docs"],
      "a markdown code-span inside a stripped JSDoc comment must not surface as a required segment",
    );
  }

  // extractPathPatternAlternatives
  {
    const source =
      "const PATH_PATTERN =\n" +
      "  /`((?:docs|apps|packages|scripts|supabase|\\.github|\\.agents|\\.cursor)\\/[A-Za-z0-9_\\-./[\\]]+\\.[a-z]{2,4})`/g;";
    const alternatives = extractPathPatternAlternatives(source);
    assert.deepEqual(
      alternatives,
      [
        "docs",
        "apps",
        "packages",
        "scripts",
        "supabase",
        ".github",
        ".agents",
        ".cursor",
      ],
      "should parse every alternative out of the PATH_PATTERN-shaped regex literal, backslash-escapes stripped",
    );
  }
  {
    assert.deepEqual(
      extractPathPatternAlternatives("no such pattern here"),
      [],
      "a file without a PATH_PATTERN-shaped alternation should yield no alternatives",
    );
  }

  // detectsRepoWideMarkdownScan
  {
    const source =
      'execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: repoRoot });';
    assert.equal(detectsRepoWideMarkdownScan(source), true);
    assert.equal(
      detectsRepoWideMarkdownScan('readdirSync(resolve(repoRoot, "docs/adr"))'),
      false,
    );
  }

  // stripJsonComments + loadTurboTestInputs
  {
    const turboJsonText = [
      "{",
      '  "tasks": {',
      '    "test": {',
      '      // a line comment mentioning a fake "quote" that must not break parsing',
      '      "dependsOn": ["^build"],',
      "      /* a block\n         comment */",
      '      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/docs/**"]',
      "    }",
      "  }",
      "}",
    ].join("\n");
    const inputs = loadTurboTestInputs(turboJsonText);
    assert.deepEqual(inputs, ["$TURBO_DEFAULT$", "$TURBO_ROOT$/docs/**"]);
  }

  // computeMissingCoverage
  {
    const isRealDirectory = (segment) =>
      new Set(["docs", "supabase", "scripts"]).has(segment);
    const turboInputs = [
      "$TURBO_DEFAULT$",
      "$TURBO_ROOT$/docs/**",
      "$TURBO_ROOT$/.env.example",
    ];
    const result = computeMissingCoverage({
      requiredSegments: new Set(["docs", "supabase", ".env.example", "apps"]),
      requiresRepoWideMarkdown: true,
      isRealDirectory,
      turboInputs,
    });
    assert.deepEqual(result.missingDirs, ["supabase"]);
    assert.deepEqual(result.missingFiles, []);
    assert.equal(result.missingMd, true);
    // "apps" is workspace-covered and must never be reported missing even
    // though it isn't a $TURBO_ROOT$ input.
  }
  {
    const isRealDirectory = () => true;
    const result = computeMissingCoverage({
      requiredSegments: new Set(["docs"]),
      requiresRepoWideMarkdown: false,
      isRealDirectory,
      turboInputs: ["$TURBO_ROOT$/docs/**"],
    });
    assert.deepEqual(result.missingDirs, []);
    assert.deepEqual(result.missingFiles, []);
    assert.equal(result.missingMd, false);
  }

  console.log("Self-test passed (10 assertions across 8 cases).");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  runRealCheck();
}

main();
