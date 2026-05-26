#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";

const HIGH_RISK_LABELS = new Set([
  "risk:high",
  "needs:human-decision",
  "area:security",
  "area:supabase",
  "area:calendar",
  "area:parser",
  "area:observability",
  "area:deployment",
]);

const HIGH_RISK_PATH_PATTERNS = [
  "supabase/**",
  "apps/web/src/lib/supabase/**",
  "apps/web/src/lib/googleCalendar/**",
  "apps/web/src/app/api/google-calendar/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/observability/**",
  "apps/web/instrumentation*",
  "apps/web/sentry*",
  "apps/web/langfuse*",
  ".github/workflows/**",
  ".env*",
  ".env.example",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
];

const HIGH_FILE_COUNT = 20;
const HIGH_TOTAL_CHANGES = 800;
const MEDIUM_FILE_COUNT = 10;
const MEDIUM_TOTAL_CHANGES = 300;

function normalizePath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
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
  const reasons = [];
  const matchedPatterns = new Set();

  for (const label of labels) {
    if (HIGH_RISK_LABELS.has(label)) {
      reasons.push(`label:${label}`);
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
    reasons.push(`path:${pattern}`);
  }

  if (changedFileCount > HIGH_FILE_COUNT) {
    reasons.push(`size:files>${HIGH_FILE_COUNT}`);
  }

  if (totalChanges > HIGH_TOTAL_CHANGES) {
    reasons.push(`size:lines>${HIGH_TOTAL_CHANGES}`);
  }

  const escalationRequired = reasons.length > 0;
  const riskLevel = escalationRequired
    ? "high"
    : changedFileCount > MEDIUM_FILE_COUNT ||
        totalChanges > MEDIUM_TOTAL_CHANGES
      ? "medium"
      : "low";

  return {
    escalationRequired,
    escalationReasons: escalationRequired ? reasons.join(", ") : "none",
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
        changedPaths: ["supabase/migrations/20260521_add_table.sql"],
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
      name: "large file count escalates",
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
        escalationRequired: true,
        riskLevel: "high",
      },
    },
    {
      name: "large churn escalates",
      input: {
        labels: [],
        changedPaths: ["README.md"],
        changedFileCount: 1,
        additions: 500,
        deletions: 400,
      },
      expected: {
        escalationRequired: true,
        riskLevel: "high",
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
