#!/usr/bin/env node
// Guard for issue #640: GitHub automation (workflows, codex prompts, issue
// templates, automation policy) must never reference a docs/ path that does
// not exist in the repository. Stale references silently rot agent context
// and can hard-fail workflows at the `git show` trusted-context step.
//
// Not wired into `pnpm test` (vitest only covers apps/web/src; there is no
// vitest harness for scripts/agent/*.mjs). Run directly:
//   node scripts/agent/trusted-context-paths.test.mjs
// Same convention as scripts/agent/status.test.mjs and
// scripts/agent/provider-canary.test.mjs. Also runs as an early step in
// .github/workflows/codex-ci-autofix.yml, the workflow this guard protects.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const githubRoot = join(repoRoot, ".github");

const SCANNED_EXTENSIONS = [".md", ".yml", ".yaml"];
// Negative lookbehind: a leading `/` or word character means the match is
// part of a longer path or URL (e.g. `.../blob/main/docs/usage.md`), which
// is not a reference to THIS repo's docs tree.
const DOC_REFERENCE_PATTERN = /(?<![A-Za-z0-9/])docs\/[A-Za-z0-9_/.-]+?\.md/g;

function listFilesRecursively(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      entries.push(...listFilesRecursively(fullPath));
    } else if (SCANNED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const scannedFiles = listFilesRecursively(githubRoot);
const scannedRelative = scannedFiles.map((file) =>
  relative(repoRoot, file).replaceAll("\\", "/"),
);

// Self-check: the guard must actually see the surfaces it protects — an
// empty or mis-rooted scan would pass vacuously.
for (const required of [
  ".github/AGENT_AUTOMATION_POLICY.md",
  ".github/ISSUE_TEMPLATE/agent-task.yml",
  ".github/workflows/codex-ci-autofix.yml",
  ".github/codex/prompts/ci-autofix.md",
]) {
  assert.ok(
    scannedRelative.includes(required),
    `guard did not scan ${required} — scan roots are wrong`,
  );
}

const missing = [];
for (const file of scannedFiles) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(DOC_REFERENCE_PATTERN)) {
    const docPath = match[0];
    if (!existsSync(join(repoRoot, docPath))) {
      missing.push(
        `${relative(repoRoot, file).replaceAll("\\", "/")} -> ${docPath}`,
      );
    }
  }
}

assert.deepEqual(
  missing,
  [],
  `Stale docs references in .github:\n${missing.join("\n")}`,
);

// Regression pin for the specific #640 breakage: the autofix workflow's
// trusted-context step must only `git show` paths that exist.
const autofixWorkflow = readFileSync(
  join(githubRoot, "workflows", "codex-ci-autofix.yml"),
  "utf8",
);
for (const match of autofixWorkflow.matchAll(
  /git show HEAD:([A-Za-z0-9_/.-]+)/g,
)) {
  assert.ok(
    existsSync(join(repoRoot, match[1])),
    `codex-ci-autofix.yml exports missing trusted context: ${match[1]}`,
  );
}

console.log("trusted-context-paths guard: OK");
