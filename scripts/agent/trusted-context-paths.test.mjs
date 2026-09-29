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
// scripts/agent/provider-canary.test.mjs. Checks the current workflows and
// their prompt paths as well as document references.

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
  ".github/workflows/codex-low-risk-issue-to-pr.yml",
  ".github/codex/prompts/low-risk-implementation.md",
  ".github/workflows/codex-issue-plan.yml",
  ".github/codex/prompts/issue-plan.md",
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

// Keep the #640 missing-context check on current workflows. Check direct
// prompt paths too; these workflows load their prompts without `git show`.
for (const file of scannedFiles.filter((file) => /\.ya?ml$/.test(file))) {
  const content = readFileSync(file, "utf8");
  for (const pattern of [
    /git show HEAD:([A-Za-z0-9_/.-]+)/g,
    /prompt-file:\s*([.]github\/[A-Za-z0-9_/.-]+)/g,
  ]) {
    for (const match of content.matchAll(pattern)) {
      assert.ok(
        existsSync(join(repoRoot, match[1])),
        `${relative(repoRoot, file)} references missing context: ${match[1]}`,
      );
    }
  }
}

console.log("trusted-context-paths guard: OK");
