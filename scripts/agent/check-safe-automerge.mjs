#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";

import {
  ADDITIVE_TESTS_LABEL,
  ADDITIVE_TESTS_REQUIRED_LABELS,
  SAFE_AUTOMERGE_BLOCKING_LABELS,
  SAFE_AUTOMERGE_REQUIRED_LABELS,
  evaluateAutomationPolicy,
  evaluateOwnerGateBlock,
  normalizePath,
} from "./automation-policy.mjs";

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

// Per-file diff stats for the additive-tests route (ADR 0008 move 1b).
// numstat reports "-" for binary files; name-status reports R/C/D for
// renames, copies, and deletions — all of those disqualify additivity.
function gitDiffStats(baseSha, headSha) {
  const numstat = execFileSync(
    "git",
    ["diff", "--numstat", `${baseSha}...${headSha}`],
    { encoding: "utf8" },
  );
  const nameStatus = execFileSync(
    "git",
    ["diff", "--name-status", `${baseSha}...${headSha}`],
    { encoding: "utf8" },
  );

  const statusByPath = new Map();
  for (const line of nameStatus.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\t/);
    const status = parts[0]?.trim() ?? "";
    // Renames/copies list two paths; take the destination, keep the status.
    const path = normalizePath(parts[parts.length - 1]);
    if (path) statusByPath.set(path, status);
  }

  const stats = [];
  for (const line of numstat.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [addedRaw, deletedRaw, ...pathParts] = line.split(/\t/);
    const path = normalizePath(pathParts[pathParts.length - 1]);
    if (!path) continue;
    const added = addedRaw === "-" ? null : Number(addedRaw);
    const deleted = deletedRaw === "-" ? null : Number(deletedRaw);
    stats.push({
      path,
      added,
      deleted,
      status: statusByPath.get(path) ?? "M",
    });
  }

  return stats;
}

// ADR 0008 move 1b: a PR is strictly-additive-tests eligible when every
// changed file is a test file, every file is added or purely-appended
// (zero deleted lines, no renames/deletions/binary), and the labels are
// right. INV-10 item 1's oracle: an addition cannot weaken an existing
// assertion, and CI still has to pass with the new tests included.
function classifyAdditiveTestsEligibility({ labels, diffStats, draft }) {
  const reasons = [];

  for (const label of ADDITIVE_TESTS_REQUIRED_LABELS) {
    if (!labels.includes(label)) {
      reasons.push(`Missing required label \`${label}\`.`);
    }
  }

  for (const label of SAFE_AUTOMERGE_BLOCKING_LABELS) {
    if (labels.includes(label)) {
      reasons.push(`Blocking label present: \`${label}\`.`);
    }
  }

  if (draft) {
    reasons.push("Pull request is still a draft.");
  }

  if (!Array.isArray(diffStats) || diffStats.length === 0) {
    reasons.push("No changed files were detected.");
    return { eligible: false, reasons };
  }

  const pathPolicyResult = evaluateAutomationPolicy(
    "additive-tests",
    diffStats.map((entry) => entry.path),
  );
  for (const violation of pathPolicyResult.violations) {
    if (violation.reason === "forbidden") {
      reasons.push(
        `Forbidden path touched: \`${violation.path}\` matched \`${violation.pattern}\`.`,
      );
      continue;
    }
    reasons.push(`Not a test path: \`${violation.path}\`.`);
  }

  for (const entry of diffStats) {
    if (entry.status !== "A" && entry.status !== "M") {
      reasons.push(
        `Non-additive change (status \`${entry.status}\`): \`${entry.path}\`.`,
      );
      continue;
    }
    if (entry.added === null || entry.deleted === null) {
      reasons.push(`Binary change disqualifies: \`${entry.path}\`.`);
      continue;
    }
    if (entry.deleted > 0) {
      reasons.push(
        `Deleted lines disqualify (${entry.deleted} removed): \`${entry.path}\`.`,
      );
    }
  }

  return { eligible: reasons.length === 0, reasons };
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

  // pull_request events always carry a `body` key (string or null when the
  // author left no description) — a genuinely missing pull_request object
  // already threw above via the missing SHAs check, so this is never the
  // "could not be read" case evaluateOwnerGateBlock fails closed on.
  const title = typeof pullRequest.title === "string" ? pullRequest.title : "";
  const body = typeof pullRequest.body === "string" ? pullRequest.body : "";

  return {
    changedPaths: gitDiffNameOnly(baseSha, headSha),
    diffStats: gitDiffStats(baseSha, headSha),
    draft: Boolean(pullRequest.draft),
    labels,
    title,
    body,
  };
}

// A PR is eligible when EITHER route passes: the docs-allowlist route
// (label `automerge:safe`) or the additive-tests route (label
// `automerge:tests-additive`, ADR 0008 move 1b). Reasons reported are the
// attempted route's; when both labels are present, either route arming
// suffices and reasons come from whichever came closer.
function classifyCombinedEligibility(context) {
  // Owner decision 2026-08-30: the owner-gate/ratification block sits above
  // both routes. Neither route may arm auto-merge while it applies, no
  // matter what labels or paths would otherwise clear it.
  const ownerGate = evaluateOwnerGateBlock(context);
  if (ownerGate.blocked) {
    return { eligible: false, reasons: ownerGate.reasons, route: null };
  }

  const docsRoute = classifyEligibility(context);
  const additiveRequested = context.labels.includes(ADDITIVE_TESTS_LABEL);

  if (!additiveRequested) {
    return {
      ...docsRoute,
      route: docsRoute.eligible ? "docs-allowlist" : null,
    };
  }

  const additiveRoute = classifyAdditiveTestsEligibility(context);
  if (additiveRoute.eligible) {
    return { ...additiveRoute, route: "additive-tests" };
  }
  if (docsRoute.eligible) {
    return { ...docsRoute, route: "docs-allowlist" };
  }

  return {
    eligible: false,
    reasons: additiveRoute.reasons,
    route: null,
  };
}

function classifyEligibility({ labels, changedPaths, draft }) {
  const reasons = [];

  for (const label of SAFE_AUTOMERGE_REQUIRED_LABELS) {
    if (!labels.includes(label)) {
      reasons.push(`Missing required label \`${label}\`.`);
    }
  }

  for (const label of SAFE_AUTOMERGE_BLOCKING_LABELS) {
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

  const pathPolicyResult = evaluateAutomationPolicy(
    "safe-automerge",
    changedPaths,
  );
  for (const violation of pathPolicyResult.violations) {
    if (violation.reason === "forbidden") {
      reasons.push(
        `Forbidden path touched: \`${violation.path}\` matched \`${violation.pattern}\`.`,
      );
      continue;
    }

    reasons.push(`Path is outside the safe allowlist: \`${violation.path}\`.`);
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
      name: "test-only pr without the additive label is blocked",
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
      name: "script control-plane path is blocked",
      input: {
        labels: ["automerge:safe", "risk:low"],
        changedPaths: ["scripts/agent/check-safe-automerge.mjs"],
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

  const additiveCases = [
    {
      name: "additive test-only pr is eligible",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: ["apps/web/src/__tests__/newGuard.test.ts"],
        diffStats: [
          {
            path: "apps/web/src/__tests__/newGuard.test.ts",
            added: 40,
            deleted: 0,
            status: "A",
          },
        ],
        draft: false,
      },
      expected: { eligible: true, reasonCount: 0, route: "additive-tests" },
    },
    {
      name: "appending assertions to an existing test file is eligible",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: ["apps/web/tests/e2e/plan-port-truth.spec.ts"],
        diffStats: [
          {
            path: "apps/web/tests/e2e/plan-port-truth.spec.ts",
            added: 12,
            deleted: 0,
            status: "M",
          },
        ],
        draft: false,
      },
      expected: { eligible: true, reasonCount: 0, route: "additive-tests" },
    },
    {
      name: "deleted lines disqualify the additive route",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: ["apps/web/src/__tests__/page.test.tsx"],
        diffStats: [
          {
            path: "apps/web/src/__tests__/page.test.tsx",
            added: 5,
            deleted: 2,
            status: "M",
          },
        ],
        draft: false,
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "non-test path disqualifies the additive route",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: [
          "apps/web/src/__tests__/page.test.tsx",
          "apps/web/src/lib/workflow/planStatus.ts",
        ],
        diffStats: [
          {
            path: "apps/web/src/__tests__/page.test.tsx",
            added: 5,
            deleted: 0,
            status: "M",
          },
          {
            path: "apps/web/src/lib/workflow/planStatus.ts",
            added: 3,
            deleted: 0,
            status: "M",
          },
        ],
        draft: false,
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "renamed test file disqualifies the additive route",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: ["apps/web/src/__tests__/renamed.test.ts"],
        diffStats: [
          {
            path: "apps/web/src/__tests__/renamed.test.ts",
            added: 0,
            deleted: 0,
            status: "R100",
          },
        ],
        draft: false,
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "additive route still respects blocking labels",
      input: {
        labels: [
          "automerge:tests-additive",
          "risk:low",
          "needs:human-decision",
        ],
        changedPaths: ["apps/web/src/__tests__/page.test.tsx"],
        diffStats: [
          {
            path: "apps/web/src/__tests__/page.test.tsx",
            added: 5,
            deleted: 0,
            status: "M",
          },
        ],
        draft: false,
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "binary test asset disqualifies the additive route",
      input: {
        labels: ["automerge:tests-additive", "risk:low"],
        changedPaths: ["apps/web/tests/e2e/fixture.png"],
        diffStats: [
          {
            path: "apps/web/tests/e2e/fixture.png",
            added: null,
            deleted: null,
            status: "A",
          },
        ],
        draft: false,
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
  ];

  // Owner decision 2026-08-30 (post-#935): owner-gate/ratification/draft
  // PRs must never arm, on EITHER route, no matter how clean the labels
  // and paths otherwise look. Each REFUSE fixture below pairs an
  // otherwise-fully-eligible docs-allowlist PR (the #935 shape) with one
  // block condition; the last fixture is the control — the same PR with
  // no block condition — proving the gate does not false-positive on a
  // normal green PR.
  const ownerGateBaseInput = {
    labels: ["automerge:safe", "risk:low"],
    changedPaths: ["docs/adr/0009-example.md"],
    draft: false,
    title: "docs: ratify ADR 0009",
    body: "Routine ADR documentation update. No open questions.",
  };

  const ownerGateCases = [
    {
      name: "REFUSE: unchecked OWNER-GATE checkbox in body",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n- [ ] OWNER-GATE: pick the vendor before merge.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    // GFM checkbox-bypass variants (verifier finding, HIGH): any of these
    // renders as a live, unchecked GitHub task list, so all must block.
    {
      name: "REFUSE: `*` bullet instead of `-`",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n* [ ] OWNER-GATE: pick vendor.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: `+` bullet instead of `-`",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n+ [ ] OWNER-GATE: pick vendor.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: empty box `[]` (no space)",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n- [] OWNER-GATE: pick vendor.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: box with two spaces `[  ]`",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n- [  ] OWNER-GATE: pick vendor.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: blockquoted checkbox line `> - [ ]`",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n> - [ ] OWNER-GATE: pick vendor.\n",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: OWNER RATIFICATION REQUIRED in body (#935 shape)",
      input: {
        ...ownerGateBaseInput,
        body: "## OWNER RATIFICATION REQUIRED\n\nADR 0009 needs the owner's sign-off before this merges.",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: OWNER-GATE heading in body",
      input: {
        ...ownerGateBaseInput,
        body: "## OWNER-GATE\n\nDo not merge until reviewed.",
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: owner-gate label present",
      input: {
        ...ownerGateBaseInput,
        labels: [...ownerGateBaseInput.labels, "owner-gate"],
      },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: draft PR (existing rule, still covered under the combined gate)",
      input: { ...ownerGateBaseInput, draft: true },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "REFUSE: body could not be read — fails closed",
      input: { ...ownerGateBaseInput, body: null },
      expected: { eligible: false, reasonCount: 1, route: null },
    },
    {
      name: "ALLOW: same PR shape, no block condition, checked OWNER-GATE box doesn't block",
      input: {
        ...ownerGateBaseInput,
        body: "Summary.\n\n- [x] OWNER-GATE: vendor picked, see comment.\n",
      },
      expected: { eligible: true, reasonCount: 0, route: "docs-allowlist" },
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

  for (const testCase of [...additiveCases, ...ownerGateCases]) {
    const result = classifyCombinedEligibility({
      title: "",
      body: "",
      ...testCase.input,
    });

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
    assert.equal(
      result.route ?? null,
      testCase.expected.route,
      `${testCase.name}: route`,
    );
  }

  console.log(
    `Self-test passed (${cases.length + additiveCases.length + ownerGateCases.length} cases).`,
  );
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const context = collectContext();
  const result = classifyCombinedEligibility(context);

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
        route: result.route ?? null,
      },
      null,
      2,
    ),
  );
}

main();
