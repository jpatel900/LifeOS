#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  ".agents",
  "playwright-report",
  "test-results",
]);
const maxContentBytes = 200_000;
const contextExtensions = new Set([
  ".css",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);
const authorityDocs = [
  "AGENTS.md",
  "docs/REQUIREMENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/ENGINEERING_INVARIANTS.md",
  "docs/UX_FLOWS.md",
  "docs/SECURITY_PRIVACY.md",
  "docs/TEST_PLAN.md",
];

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function walk(relativePath = "") {
  const absolutePath = join(repoRoot, relativePath);

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        return [];
      }

      return walk(nextRelativePath);
    }

    if (!entry.isFile()) {
      return [];
    }

    return [nextRelativePath];
  });
}

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function pathScore(path, terms) {
  const lowerPath = path.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (lowerPath.includes(term)) {
      score += 10;
    }
  }

  if (path.startsWith("docs/")) {
    score += 3;
  }

  if (path.startsWith("apps/web/src/app/")) {
    score += 2;
  }

  if (path.includes("__tests__") || path.endsWith(".test.ts")) {
    score += 1;
  }

  return score;
}

function contentScore(path, terms) {
  if (!contextExtensions.has(extensionOf(path))) {
    return 0;
  }

  try {
    if (readFileSync(join(repoRoot, path)).byteLength > maxContentBytes) {
      return 0;
    }

    const content = readText(path).toLowerCase();
    return terms.reduce((score, term) => {
      const matches = content.match(new RegExp(escapeRegExp(term), "g"));
      return score + Math.min(matches?.length ?? 0, 5);
    }, 0);
  } catch {
    return 0;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function packageNames(files) {
  return files
    .filter((path) => path.endsWith("package.json"))
    .map((path) => {
      const packageJson = JSON.parse(readText(path));
      return {
        path,
        name: packageJson.name ?? relative(repoRoot, dirname(path)),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function printList(label, values) {
  console.log(`${label}:`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

const areaName = process.argv[2];

if (!areaName) {
  exitWithError("Usage: pnpm agent:context <area>");
}

const terms = areaName
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

if (terms.length === 0) {
  exitWithError("Area must include at least one letter or number.");
}

const files = walk().filter((path) => contextExtensions.has(extensionOf(path)));
const rankedFiles = files
  .map((path) => ({
    path,
    score: pathScore(path, terms) * 10 + contentScore(path, terms),
  }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  .map(({ path }) => path);

if (rankedFiles.length === 0) {
  console.error(`No repo context matched area: ${areaName}`);
  console.error(
    "Try a product term, route name, package name, or directory stem.",
  );
  process.exit(1);
}

console.log(`Area: ${areaName}`);
console.log(
  "Purpose: Generated filesystem search context. Use this as a routing aid only; authority docs and source files remain binding.",
);
printList(
  "Read first",
  authorityDocs.filter((path) => existsSync(join(repoRoot, path))),
);
printList("Likely files", rankedFiles.slice(0, 12));
printList(
  "Workspace packages",
  packageNames(files).map(({ name, path }) => `${name} (${path})`),
);
console.log(
  "Quick checks: derive from touched package scripts; final validation still follows AGENTS.md.",
);
printList("Suggested discovery", [
  `rg -n "${terms.join("|")}" . --glob '!node_modules'`,
  "pnpm format:check",
]);
