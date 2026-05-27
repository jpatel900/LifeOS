#!/usr/bin/env node

import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";

import {
  evaluateAutomationPolicy,
  normalizePath,
} from "./automation-policy.mjs";

function parseArgs(argv) {
  const args = {
    changedFiles: [],
    mode: "",
    pathsFile: "",
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (value === "--mode") {
      args.mode = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--paths-file") {
      args.pathsFile = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--changed-file") {
      args.changedFiles.push(argv[index + 1] ?? "");
      index += 1;
    }
  }

  return args;
}

function readPathsFile(path) {
  if (!path || !existsSync(path)) {
    return [];
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => normalizePath(line))
    .filter(Boolean);
}

function toMarkdownList(violations) {
  if (violations.length === 0) {
    return "- None.";
  }

  return violations
    .map(
      ({ path, reason, pattern }) =>
        `- \`${path}\` (${reason}: \`${pattern}\`)`,
    )
    .join("\n");
}

function writeOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    [
      `eligible=${result.eligible}`,
      `blocked=${!result.eligible}`,
      "violations<<EOF",
      result.violations.map(({ path }) => path).join("\n"),
      "EOF",
      "violations_markdown<<EOF",
      toMarkdownList(result.violations),
      "EOF",
      "",
    ].join("\n"),
  );
}

function runSelfTest() {
  const cases = [
    {
      name: "safe automerge docs-only path is eligible",
      input: {
        mode: "safe-automerge",
        changedPaths: [
          "docs/guide.md",
          ".github/ISSUE_TEMPLATE/agent-task.yml",
        ],
      },
      expectedEligible: true,
    },
    {
      name: "safe automerge rejects workflow files",
      input: {
        mode: "safe-automerge",
        changedPaths: [".github/workflows/ci.yml"],
      },
      expectedEligible: false,
    },
    {
      name: "safe automerge allows readme",
      input: {
        mode: "safe-automerge",
        changedPaths: ["README.md"],
      },
      expectedEligible: true,
    },
    {
      name: "safe automerge rejects paths outside allowlist",
      input: {
        mode: "safe-automerge",
        changedPaths: ["scripts/agent/check-safe-automerge.mjs"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects prompt files",
      input: {
        mode: "low-risk",
        changedPaths: [".github/codex/prompts/low-risk-implementation.md"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects workflow files",
      input: {
        mode: "low-risk",
        changedPaths: [".github/workflows/codex-low-risk-issue-to-pr.yml"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects package manifests",
      input: {
        mode: "low-risk",
        changedPaths: ["package.json", "pnpm-lock.yaml"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects env files",
      input: {
        mode: "low-risk",
        changedPaths: [".env.local"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects supabase and migrations",
      input: {
        mode: "low-risk",
        changedPaths: ["supabase/migrations/20260527_test.sql"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects auth surfaces",
      input: {
        mode: "low-risk",
        changedPaths: ["apps/web/src/app/login/page.tsx"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects parser surfaces",
      input: {
        mode: "low-risk",
        changedPaths: ["apps/web/src/lib/ai/parseCapture.ts"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects calendar surfaces",
      input: {
        mode: "low-risk",
        changedPaths: ["apps/web/src/lib/googleCalendar/createEvent.ts"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects observability surfaces",
      input: {
        mode: "low-risk",
        changedPaths: ["apps/web/src/lib/observability/index.ts"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk rejects automation scripts",
      input: {
        mode: "low-risk",
        changedPaths: ["scripts/agent/check-safe-automerge.mjs"],
      },
      expectedEligible: false,
    },
    {
      name: "low-risk allows docs and issue templates",
      input: {
        mode: "low-risk",
        changedPaths: [
          "docs/agent/guide.md",
          ".github/ISSUE_TEMPLATE/agent-task.yml",
        ],
      },
      expectedEligible: true,
    },
    {
      name: "ci autofix rejects auth-like login path",
      input: {
        mode: "ci-autofix",
        changedPaths: ["apps/web/src/app/login/page.tsx"],
      },
      expectedEligible: false,
    },
    {
      name: "ci autofix rejects supabase client surface",
      input: {
        mode: "ci-autofix",
        changedPaths: ["apps/web/src/lib/supabase/client.ts"],
      },
      expectedEligible: false,
    },
    {
      name: "ci autofix rejects package manifests",
      input: {
        mode: "ci-autofix",
        changedPaths: ["package.json"],
      },
      expectedEligible: false,
    },
    {
      name: "ci autofix allows bounded docs fix",
      input: {
        mode: "ci-autofix",
        changedPaths: ["docs/agent/guide.md"],
      },
      expectedEligible: true,
    },
  ];

  for (const testCase of cases) {
    const result = evaluateAutomationPolicy(
      testCase.input.mode,
      testCase.input.changedPaths,
    );
    assert.equal(
      result.eligible,
      testCase.expectedEligible,
      `${testCase.name}: eligible`,
    );
  }

  console.log(`Self-test passed (${cases.length} cases).`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.mode) {
    throw new Error("--mode is required.");
  }

  const changedPaths = [
    ...args.changedFiles.map((path) => normalizePath(path)),
    ...readPathsFile(args.pathsFile),
  ].filter(Boolean);

  const result = evaluateAutomationPolicy(args.mode, changedPaths);
  writeOutputs(result);
  console.log(JSON.stringify(result, null, 2));
}

main();
