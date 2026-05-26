#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";

const REQUIRED_LABELS = ["automerge:safe", "risk:low"];
const BLOCKING_LABELS = ["risk:medium", "risk:high", "needs:human-decision"];

const ALLOWED_PATH_PATTERNS = [
  "docs/**",
  "README.md",
  ".github/ISSUE_TEMPLATE/**",
];

const FORBIDDEN_PATH_PATTERNS = [
  "supabase/**",
  "**/migrations/**",
  "apps/web/src/lib/googleCalendar/**",
  "apps/web/src/app/api/google-calendar/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/observability/**",
  "apps/web/src/lib/supabase/**",
  ".env*",
  "package.json",
  "pnpm-lock.yaml",
  "turbo.json",
  "pnpm-workspace.yaml",
  ".github/workflows/**",
  ".github/actions/**",
  "vercel.json",
  ".vercel/**",
];

function normalizePath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let regex = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char === "*") {
      if (normalized[index + 1] === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  regex += "$";
  return new RegExp(regex);
}

const ALLOWED_PATH_REGEXES = ALLOWED_PATH_PATTERNS.map((pattern) => ({
  pattern,
  regex: globToRegExp(pattern),
}));

const FORBIDDEN_PATH_REGEXES = FORBIDDEN_PATH_PATTERNS.map((pattern) => ({
  pattern,
  regex: globToRegExp(pattern),
}));

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !existsSync(eventPath)) {
    return {};
  }

  return JSON.parse(readFileSync(eventPath, "utf8"));
}

function gitDiffNameOnly(baseSha, headSha) {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${baseSha}...${headSha}`],
    { encoding: "utf8" },
  );

  return output
    .split(/\r?\n/)
    .map((line) => normalizePath(line))
    .filter(Boolean);
}

function collectContext() {
  const event = readEventPayload();
  const pullRequest = event.pull_request ?? {};
  const baseSha = process.env.PR_BASE_SHA ?? pullRequest.base?.sha;
  const headSha = process.env.PR_HEAD_SHA ?? pullRequest.head?.sha;

  if (!baseSha || !headSha) {
    throw new Error(
      "PR_BASE_SHA and PR_HEAD_SHA are required for safe auto-merge checks.",
    );
  }

  const labels = Array.isArray(pullRequest.labels)
    ? pullRequest.labels.map((label) => label?.name).filter(Boolean)
    : [];

  return {
    changedPaths: gitDiffNameOnly(baseSha, headSha),
    draft: Boolean(pullRequest.draft),
    labels,
  };
}

function classifyEligibility({ labels, changedPaths, draft }) {
  const reasons = [];

  for (const label of REQUIRED_LABELS) {
    if (!labels.includes(label)) {
      reasons.push(`Missing required label \`${label}\`.`);
    }
  }

  for (const label of BLOCKING_LABELS) {
    if (labels.includes(label)) {
      reasons.push(`Blocking label present: \`${label}\`.`);
    }
  }

  if (draft) {
    reasons.push("Pull request is still a draft.");
  }

  if (changedPaths.length === 0) {
    reasons.push("No changed files were detected.");
  }

  for (const changedPath of changedPaths) {
    const forbiddenMatch = FORBIDDEN_PATH_REGEXES.find(({ regex }) =>
      regex.test(changedPath),
    );

    if (forbiddenMatch) {
      reasons.push(
        `Forbidden path touched: \`${changedPath}\` matched \`${forbiddenMatch.pattern}\`.`,
      );
      continue;
    }

    const allowedMatch = ALLOWED_PATH_REGEXES.some(({ regex }) =>
      regex.test(changedPath),
    );

    if (!allowedMatch) {
      reasons.push(`Path is outside the safe allowlist: \`${changedPath}\`.`);
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function toMarkdownList(items, emptyText) {
  if (items.length === 0) {
    return `- ${emptyText}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function writeOutputs({ changedPaths, eligible, reasons }) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    [
      `eligible=${eligible}`,
      "reasons_markdown<<EOF",
      toMarkdownList(reasons, "Eligible."),
      "EOF",
      "changed_files_markdown<<EOF",
      toMarkdownList(
        changedPaths.map((path) => `\`${path}\``),
        "None.",
      ),
      "EOF",
      "",
    ].join("\n"),
  );
}

function runSelfTest() {
  const cases = [
    {
      name: "eligible docs-only pr",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: ["docs/agent/README.md", "README.md"],
        draft: false,
      },
      expected: {
        eligible: true,
        reasonCount: 0,
      },
    },
    {
      name: "test-only pr is blocked until a stronger guard exists",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: ["apps/web/src/__tests__/page.test.tsx"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "automation prompt files are blocked",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: [".github/codex/prompts/low-risk-implementation.md"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "missing required label is blocked",
      input: {
        labels: ["risk:low"],
        changedPaths: ["docs/guide.md"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "blocking label is blocked",
      input: {
        labels: ["automerge:safe", "risk:low", "risk:high"],
        changedPaths: ["docs/guide.md"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "forbidden path is blocked",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: ["apps/web/src/lib/ai/parseCapture.ts"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "unsafe metadata path is blocked",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: [".github/workflows/ci.yml"],
        draft: false,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
    {
      name: "draft pr is blocked",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: ["docs/guide.md"],
        draft: true,
      },
      expected: {
        eligible: false,
        reasonCount: 1,
      },
    },
  ];

  for (const testCase of cases) {
    const result = classifyEligibility(testCase.input);

    assert.equal(
      result.eligible,
      testCase.expected.eligible,
      `${testCase.name}: eligible`,
    );
    assert.equal(
      result.reasons.length,
      testCase.expected.reasonCount,
      `${testCase.name}: reasonCount`,
    );
  }

  console.log(`Self-test passed (${cases.length} cases).`);
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const context = collectContext();
  const result = classifyEligibility(context);

  writeOutputs({
    changedPaths: context.changedPaths,
    eligible: result.eligible,
    reasons: result.reasons,
  });

  console.log(
    JSON.stringify(
      {
        changed_paths: context.changedPaths,
        draft: context.draft,
        eligible: result.eligible,
        labels: context.labels,
        reasons: result.reasons,
      },
      null,
      2,
    ),
  );
}

main();
