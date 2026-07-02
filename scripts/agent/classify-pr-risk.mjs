#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";

import {
  HIGH_RISK_LABELS,
  HIGH_RISK_PATH_PATTERNS,
  globToRegExp,
  normalizePath,
} from "./automation-policy.mjs";

const HIGH_FILE_COUNT = 20;
const HIGH_TOTAL_CHANGES = 800;
const MEDIUM_FILE_COUNT = 10;
const MEDIUM_TOTAL_CHANGES = 300;

const HIGH_RISK_PATH_REGEXES = HIGH_RISK_PATH_PATTERNS.map((pattern) => ({
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
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean);
}

function gitDiffNumstat(baseSha, headSha) {
  const output = execFileSync(
    "git",
    ["diff", "--numstat", `${baseSha}...${headSha}`],
    { encoding: "utf8" },
  );

  return output.split(/\r?\n/).reduce(
    (totals, line) => {
      if (!line.trim()) {
        return totals;
      }

      const [additionsRaw, deletionsRaw] = line.split("\t");
      const additions =
        additionsRaw && additionsRaw !== "-"
          ? Number.parseInt(additionsRaw, 10)
          : 0;
      const deletions =
        deletionsRaw && deletionsRaw !== "-"
          ? Number.parseInt(deletionsRaw, 10)
          : 0;

      return {
        additions:
          totals.additions + (Number.isFinite(additions) ? additions : 0),
        deletions:
          totals.deletions + (Number.isFinite(deletions) ? deletions : 0),
      };
    },
    { additions: 0, deletions: 0 },
  );
}

function collectContext() {
  const event = readEventPayload();
  const pullRequest = event.pull_request ?? {};
  const baseSha = process.env.PR_BASE_SHA ?? pullRequest.base?.sha;
  const headSha = process.env.PR_HEAD_SHA ?? pullRequest.head?.sha;

  if (!baseSha || !headSha) {
    throw new Error(
      "PR_BASE_SHA and PR_HEAD_SHA are required for risk classification.",
    );
  }

  const changedPaths = gitDiffNameOnly(baseSha, headSha);
  const { additions, deletions } = gitDiffNumstat(baseSha, headSha);
  const labels = Array.isArray(pullRequest.labels)
    ? pullRequest.labels.map((label) => label?.name).filter(Boolean)
    : [];

  return {
    additions,
    changedFileCount: changedPaths.length,
    changedPaths,
    deletions,
    labels,
  };
}

function classifyRisk({
  labels,
  changedPaths,
  changedFileCount,
  additions,
  deletions,
}) {
  const totalChanges = additions + deletions;
  // Escalation (the expensive full-model review) is earned by RISK — sensitive
  // paths or high-risk labels — never by bulk alone. Size still raises the risk
  // label for visibility and keeps a PR out of the safe auto-merge lane, but a
  // big-but-boring diff gets the baseline reviewer, not the escalated one.
  const riskReasons = [];
  const sizeReasons = [];
  const matchedPatterns = new Set();

  for (const label of labels) {
    if (HIGH_RISK_LABELS.has(label)) {
      riskReasons.push(`label:${label}`);
    }
  }

  for (const changedPath of changedPaths) {
    for (const { pattern, regex } of HIGH_RISK_PATH_REGEXES) {
      if (regex.test(changedPath)) {
        matchedPatterns.add(pattern);
      }
    }
  }

  for (const pattern of matchedPatterns) {
    riskReasons.push(`path:${pattern}`);
  }

  if (changedFileCount > HIGH_FILE_COUNT) {
    sizeReasons.push(`size:files>${HIGH_FILE_COUNT}`);
  }

  if (totalChanges > HIGH_TOTAL_CHANGES) {
    sizeReasons.push(`size:lines>${HIGH_TOTAL_CHANGES}`);
  }

  const escalationRequired = riskReasons.length > 0;
  const riskLevel = escalationRequired
    ? "high"
    : sizeReasons.length > 0 ||
        changedFileCount > MEDIUM_FILE_COUNT ||
        totalChanges > MEDIUM_TOTAL_CHANGES
      ? "medium"
      : "low";
  const allReasons = [...riskReasons, ...sizeReasons];

  return {
    escalationRequired,
    escalationReasons: allReasons.length > 0 ? allReasons.join(", ") : "none",
    riskLevel,
  };
}

function writeOutputs(result) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    [
      `escalation_required=${result.escalationRequired}`,
      `risk_level=${result.riskLevel}`,
      `escalation_reasons=${result.escalationReasons}`,
      "",
    ].join("\n"),
  );
}

function runSelfTest() {
  const cases = [
    {
      name: "label trigger escalates",
      input: {
        labels: ["risk:high"],
        changedPaths: ["apps/web/src/app/page.tsx"],
        changedFileCount: 1,
        additions: 10,
        deletions: 2,
      },
      expected: {
        escalationRequired: true,
        riskLevel: "high",
      },
    },
    {
      name: "path trigger escalates",
      input: {
        labels: [],
        changedPaths: [".github/codex/prompts/pr-review-baseline.md"],
        changedFileCount: 1,
        additions: 20,
        deletions: 0,
      },
      expected: {
        escalationRequired: true,
        riskLevel: "high",
      },
    },
    {
      name: "large file count raises risk but does not escalate",
      input: {
        labels: [],
        changedPaths: Array.from(
          { length: 21 },
          (_, index) => `docs/file-${index}.md`,
        ),
        changedFileCount: 21,
        additions: 100,
        deletions: 50,
      },
      expected: {
        escalationRequired: false,
        riskLevel: "medium",
      },
    },
    {
      name: "large churn raises risk but does not escalate",
      input: {
        labels: [],
        changedPaths: ["README.md"],
        changedFileCount: 1,
        additions: 500,
        deletions: 400,
      },
      expected: {
        escalationRequired: false,
        riskLevel: "medium",
      },
    },
    {
      name: "medium non-escalated risk is preserved",
      input: {
        labels: [],
        changedPaths: Array.from(
          { length: 11 },
          (_, index) => `docs/notes-${index}.md`,
        ),
        changedFileCount: 11,
        additions: 120,
        deletions: 40,
      },
      expected: {
        escalationRequired: false,
        riskLevel: "medium",
      },
    },
    {
      name: "small safe diff stays low risk",
      input: {
        labels: [],
        changedPaths: ["docs/agent/README.md"],
        changedFileCount: 1,
        additions: 12,
        deletions: 3,
      },
      expected: {
        escalationRequired: false,
        riskLevel: "low",
      },
    },
  ];

  for (const testCase of cases) {
    const result = classifyRisk(testCase.input);
    assert.equal(
      result.escalationRequired,
      testCase.expected.escalationRequired,
      `${testCase.name}: escalationRequired`,
    );
    assert.equal(
      result.riskLevel,
      testCase.expected.riskLevel,
      `${testCase.name}: riskLevel`,
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
  const result = classifyRisk(context);

  writeOutputs(result);

  console.log(
    JSON.stringify(
      {
        ...result,
        additions: context.additions,
        changed_file_count: context.changedFileCount,
        deletions: context.deletions,
      },
      null,
      2,
    ),
  );
}

main();
