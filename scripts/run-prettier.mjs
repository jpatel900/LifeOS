#!/usr/bin/env node
// #871 (same class as #867/#869): `prettier --write .` / `prettier --check .`
// walk the whole working tree, so an untracked local scratch file -- a
// lane's WORKPLAN.md, a stray temp file, anything not in git at all -- fails
// format locally while CI, which only ever sees committed content, stays
// green. That local-vs-CI divergence was already fixed for the doc-registry
// guard by reading the file list from git instead of the disk
// (docRegistry.test.ts's `listTrackedMarkdownFiles()`, #869); this applies
// the identical fix to Prettier, which has no git-awareness of its own.
//
// `git ls-files` IS the tracked-file set -- no separate ignore-list to keep
// in sync with `.gitignore`, and no risk of a scratch filename the ignore
// list has not been told about yet.
//
// CRITICAL invariant this script must hold: every tracked file that was
// checked before this script existed must still be checked, and nothing
// tracked is now skipped. `.prettierignore` still applies (Prettier consults
// it per-file regardless of how the file list was assembled), so vendored
// and generated content stays excluded exactly as it was.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const prettierBin = join(
  repoRoot,
  "node_modules",
  "prettier",
  "bin",
  "prettier.cjs",
);

const mode = process.argv[2];
if (mode !== "write" && mode !== "check") {
  console.error("Usage: node scripts/run-prettier.mjs <write|check>");
  process.exit(2);
}
const flag = mode === "write" ? "--write" : "--check";

const lsFilesOutput = execFileSync("git", ["ls-files", "-z"], {
  cwd: repoRoot,
  maxBuffer: 64 * 1024 * 1024,
});
const files = lsFilesOutput.toString("utf8").split("\0").filter(Boolean);

if (files.length === 0) {
  // A vacuous pass here (0 files "checked", exit 0) would be worse than
  // failing loudly -- see run-depcruise.mjs's own minModules guard for the
  // same reasoning applied to a different tool.
  console.error(
    "run-prettier: `git ls-files` returned no tracked files -- refusing to " +
      "silently pass. Run from inside the repo working tree.",
  );
  process.exit(1);
}

// Batch by character budget, not file count. On Windows, a child process
// launched via CreateProcess has a real command-line-length ceiling; keeping
// each batch well under it means this script does not need retuning as the
// repo's tracked-file count grows.
const CHAR_BUDGET = 20000;
const batches = [];
let current = [];
let currentLength = 0;
for (const file of files) {
  const addedLength = file.length + 1;
  if (current.length > 0 && currentLength + addedLength > CHAR_BUDGET) {
    batches.push(current);
    current = [];
    currentLength = 0;
  }
  current.push(file);
  currentLength += addedLength;
}
if (current.length > 0) batches.push(current);

let failed = false;
for (const batch of batches) {
  try {
    execFileSync(
      process.execPath,
      [prettierBin, flag, "--ignore-unknown", ...batch],
      { cwd: repoRoot, stdio: "inherit" },
    );
  } catch {
    // Keep going so `check` reports every offending file across every
    // batch in one run, matching the single-pass whole-tree behavior this
    // replaces -- not just the first batch that happens to fail.
    failed = true;
  }
}

if (failed) {
  console.error(
    `\nrun-prettier ${mode}: FAILED -- ${files.length} git-tracked files considered (untracked files were not walked).`,
  );
  process.exit(1);
}

console.log(
  `run-prettier ${mode}: PASSED -- ${files.length} git-tracked files ${
    mode === "write" ? "formatted" : "match Prettier style"
  }.`,
);
