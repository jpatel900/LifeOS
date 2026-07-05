#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import {
  SAFE_AUTOMERGE_ALLOWED_PATH_PATTERNS,
  globToRegExp,
  normalizePath,
} from "./automation-policy.mjs";

const SAFE_AUTOMERGE_POLICY_PATH = "scripts/agent/automation-policy.mjs";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

export function safeBranchFragment(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/, "/")
    .replace(/(^[-/.]+|[-/.]+$)/g, "")
    .replace(/\//g, "-")
    .slice(0, 80);
}

export function classifySafeAutomergeClass(changedPaths) {
  const normalizedPaths = changedPaths
    .map((path) => normalizePath(path))
    .filter(Boolean);
  if (normalizedPaths.length === 0) {
    return null;
  }

  const matchedPatterns = new Set();
  for (const changedPath of normalizedPaths) {
    const matches = SAFE_AUTOMERGE_ALLOWED_PATH_PATTERNS.filter((pattern) =>
      globToRegExp(pattern).test(changedPath),
    );
    if (matches.length === 0) {
      return null;
    }
    for (const match of matches) {
      matchedPatterns.add(match);
    }
  }

  if (matchedPatterns.size !== 1) {
    return null;
  }

  return [...matchedPatterns][0];
}

export function removeAllowlistClass(source, allowlistClass) {
  const escaped = allowlistClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePattern = new RegExp(`^\\s*[\"']${escaped}[\"'],\\n`, "m");
  const next = source.replace(linePattern, "");

  if (next === source) {
    throw new Error(
      `Allowlist class not found in ${SAFE_AUTOMERGE_POLICY_PATH}: ${allowlistClass}`,
    );
  }

  return next;
}

export function buildDemotionBranch(allowlistClass) {
  return `guard/demote-safe-automerge-${safeBranchFragment(allowlistClass)}`;
}

export function buildDemotionBody({
  allowlistClass,
  triggerKind,
  triggerUrl,
  implicatedSha,
  implicatedPr,
}) {
  const triggerLabel =
    triggerKind === "revert" ? "canonical revert on main" : "red main CI";
  const prLine = implicatedPr ? `\n- Implicated PR: #${implicatedPr}` : "";

  return [
    `Main Red Guard detected that safe auto-merge class \`${allowlistClass}\` was implicated by ${triggerLabel}.`,
    "",
    "This PR demotes that class to human-merge by removing it from the safe auto-merge allowlist. It does not modify `main` directly; a human merge of this PR is the confirmation step.",
    "",
    "## Trigger",
    `- Trigger type: ${triggerKind}`,
    `- Trigger URL: ${triggerUrl || "not provided"}`,
    `- Implicated commit: ${implicatedSha || "not provided"}${prLine}`,
    "",
    "## Re-graduation",
    "Re-graduation is out of scope here and must follow the prove-then-trust expansion policy from scratch.",
    "",
    "Opened automatically by Main Red Guard.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function ghJson(args) {
  const output = run("gh", args);
  return output ? JSON.parse(output) : null;
}

function getChangedPathsForCommit(sha) {
  const prList = ghJson([
    "api",
    `/repos/${process.env.GITHUB_REPOSITORY}/commits/${sha}/pulls`,
    "-H",
    "Accept: application/vnd.github+json",
  ]);
  const autoPr = (prList ?? []).find(
    (pr) => pr?.merged_by?.login === "github-actions[bot]",
  );

  if (!autoPr?.number) {
    return {
      changedPaths: [],
      implicatedPr: null,
    };
  }

  const files = ghJson([
    "api",
    `/repos/${process.env.GITHUB_REPOSITORY}/pulls/${autoPr.number}/files`,
    "--paginate",
  ]);
  return {
    changedPaths: (files ?? []).map((file) => file.filename).filter(Boolean),
    implicatedPr: autoPr.number,
  };
}

function findRevertedSha(message) {
  return /This reverts commit ([0-9a-f]{40})\./i.exec(message)?.[1] ?? null;
}

function getOpenDemotionPr(branch) {
  const prs = ghJson([
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "number,url",
  ]);
  return prs?.[0] ?? null;
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function openDemotionPr({
  allowlistClass,
  triggerKind,
  triggerUrl,
  implicatedSha,
  implicatedPr,
}) {
  const branch = buildDemotionBranch(allowlistClass);
  const existing = getOpenDemotionPr(branch);
  if (existing) {
    console.log(
      `Open demotion PR already exists for ${allowlistClass}: ${existing.url}`,
    );
    writeOutput("demotion_pr_url", existing.url);
    writeOutput("deduped", "true");
    return;
  }

  run("git", ["config", "user.name", "main-red-guard[bot]"]);
  run("git", [
    "config",
    "user.email",
    "main-red-guard@users.noreply.github.com",
  ]);
  run("git", ["switch", "-c", branch]);

  const current = readFileSync(SAFE_AUTOMERGE_POLICY_PATH, "utf8");
  writeFileSync(
    SAFE_AUTOMERGE_POLICY_PATH,
    removeAllowlistClass(current, allowlistClass),
  );
  run("git", ["add", SAFE_AUTOMERGE_POLICY_PATH]);
  run("git", [
    "commit",
    "-m",
    `Demote safe auto-merge class ${allowlistClass}`,
  ]);
  run("git", ["push", "origin", branch]);

  const url = run("gh", [
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    branch,
    "--title",
    `Demote safe auto-merge class: ${allowlistClass}`,
    "--body",
    buildDemotionBody({
      allowlistClass,
      triggerKind,
      triggerUrl,
      implicatedSha,
      implicatedPr,
    }),
  ]);
  writeOutput("demotion_pr_url", url);
  writeOutput("deduped", "false");
  console.log(url);
}

function runDemotion(args) {
  const triggerKind = args["trigger-kind"];
  let implicatedSha = args["implicated-sha"];
  const triggerUrl = args["trigger-url"] ?? "";

  if (triggerKind === "revert") {
    const message = run("git", [
      "log",
      "-1",
      "--pretty=%B",
      args["revert-sha"] ?? "HEAD",
    ]);
    implicatedSha = findRevertedSha(message);
    if (!implicatedSha) {
      console.log(
        "No canonical revert commit found; skipping safe auto-merge demotion.",
      );
      writeOutput("skipped", "not-canonical-revert");
      return;
    }
  }

  if (!implicatedSha) {
    throw new Error(
      "--implicated-sha is required unless --trigger-kind revert can parse a canonical revert.",
    );
  }

  const { changedPaths, implicatedPr } =
    getChangedPathsForCommit(implicatedSha);
  const allowlistClass = classifySafeAutomergeClass(changedPaths);
  if (!allowlistClass) {
    console.log(
      `Commit ${implicatedSha} is not attributable to exactly one safe auto-merge class; skipping.`,
    );
    writeOutput("skipped", "no-single-safe-class");
    return;
  }

  openDemotionPr({
    allowlistClass,
    triggerKind,
    triggerUrl,
    implicatedSha,
    implicatedPr,
  });
}

function runSelfTest() {
  assert.equal(
    classifySafeAutomergeClass(["docs/a.md", "docs/nested/b.md"]),
    "docs/**",
  );
  assert.equal(classifySafeAutomergeClass(["README.md"]), "README.md");
  assert.equal(classifySafeAutomergeClass(["docs/a.md", "README.md"]), null);
  assert.equal(classifySafeAutomergeClass(["apps/web/src/app/page.tsx"]), null);
  assert.equal(
    buildDemotionBranch(".github/ISSUE_TEMPLATE/**"),
    "guard/demote-safe-automerge-github-issue_template",
  );

  const fixture = `const x = [\n  "docs/**",\n  "README.md",\n  ".github/ISSUE_TEMPLATE/**",\n];\n`;
  assert.equal(
    removeAllowlistClass(fixture, "README.md"),
    `const x = [\n  "docs/**",\n  ".github/ISSUE_TEMPLATE/**",\n];\n`,
  );
  assert.throws(() => removeAllowlistClass(fixture, "missing/**"), /not found/);

  const body = buildDemotionBody({
    allowlistClass: "docs/**",
    triggerKind: "red-main",
    triggerUrl: "https://example.invalid/run/1",
    implicatedSha: "abc123",
    implicatedPr: 123,
  });
  assert.match(body, /`docs\/\*\*`/);
  assert.match(body, /red main CI/);
  assert.match(body, /#123/);

  console.log("Self-test passed (8 assertions). ");
}

function main() {
  const args = parseArgs(process.argv);
  if (args["self-test"]) {
    runSelfTest();
    return;
  }
  runDemotion(args);
}

main();
