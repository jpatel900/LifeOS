import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SAFE_AUTOMERGE_BLOCKING_LABELS } from "./automation-policy.mjs";

export const LOW_RISK_APPROVAL_LABEL = "agent:ready";

function issueSnapshot(issue) {
  return {
    title: issue?.title ?? "",
    body: issue?.body ?? "",
  };
}

export function resolveApprovedIssueInput({
  eventName,
  eventAction,
  eventLabel,
  eventIssue,
  currentIssue,
}) {
  const current = issueSnapshot(currentIssue);

  if (eventName === "workflow_dispatch") {
    return {
      authorized: true,
      reason: "manual-dispatch",
      issue: current,
    };
  }

  if (
    eventName !== "issues" ||
    eventAction !== "labeled" ||
    eventLabel !== LOW_RISK_APPROVAL_LABEL
  ) {
    return {
      authorized: false,
      reason: "not-agent-ready-approval",
      issue: current,
    };
  }

  const approved = issueSnapshot(eventIssue);
  if (approved.title !== current.title || approved.body !== current.body) {
    return {
      authorized: false,
      reason: "approved-snapshot-drift",
      issue: approved,
    };
  }

  return {
    authorized: true,
    reason: "agent-ready-snapshot-match",
    issue: approved,
  };
}

export function evaluateLowRiskEligibility({
  approval,
  issueState,
  labels,
  alreadyAssigned,
  alreadyClaimed,
  linkedOpenPr,
}) {
  const labelSet = new Set(labels);
  const blockingLabels = SAFE_AUTOMERGE_BLOCKING_LABELS.filter((label) =>
    labelSet.has(label),
  );
  const reasons = [];

  if (!approval.authorized) reasons.push(approval.reason);
  if (issueState !== "open") reasons.push("issue-not-open");
  if (!labelSet.has(LOW_RISK_APPROVAL_LABEL))
    reasons.push("missing-agent-ready");
  if (!labelSet.has("risk:low")) reasons.push("missing-risk-low");
  reasons.push(...blockingLabels.map((label) => `blocking-label:${label}`));
  if (alreadyAssigned) reasons.push("already-assigned");
  if (alreadyClaimed) reasons.push("already-claimed");
  if (linkedOpenPr) reasons.push("linked-open-pr");

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTests() {
  const issue = { title: "Bounded change", body: "Acceptance criteria" };
  const readyApproval = resolveApprovedIssueInput({
    eventName: "issues",
    eventAction: "labeled",
    eventLabel: LOW_RISK_APPROVAL_LABEL,
    eventIssue: issue,
    currentIssue: issue,
  });
  const cases = [
    {
      name: "agent-ready label authorizes an unchanged snapshot",
      actual: readyApproval.authorized,
      expected: true,
    },
    {
      name: "unrelated labels do not authorize execution",
      actual: resolveApprovedIssueInput({
        eventName: "issues",
        eventAction: "labeled",
        eventLabel: "risk:low",
        eventIssue: issue,
        currentIssue: issue,
      }).authorized,
      expected: false,
    },
    {
      name: "issue edits do not authorize execution",
      actual: resolveApprovedIssueInput({
        eventName: "issues",
        eventAction: "edited",
        eventLabel: null,
        eventIssue: issue,
        currentIssue: issue,
      }).authorized,
      expected: false,
    },
    {
      name: "title drift fails closed",
      actual: resolveApprovedIssueInput({
        eventName: "issues",
        eventAction: "labeled",
        eventLabel: LOW_RISK_APPROVAL_LABEL,
        eventIssue: issue,
        currentIssue: { ...issue, title: "Changed after approval" },
      }).reason,
      expected: "approved-snapshot-drift",
    },
    {
      name: "body drift fails closed",
      actual: resolveApprovedIssueInput({
        eventName: "issues",
        eventAction: "labeled",
        eventLabel: LOW_RISK_APPROVAL_LABEL,
        eventIssue: issue,
        currentIssue: { ...issue, body: "Changed after approval" },
      }).reason,
      expected: "approved-snapshot-drift",
    },
    {
      name: "manual dispatch authorizes the current snapshot",
      actual: resolveApprovedIssueInput({
        eventName: "workflow_dispatch",
        eventAction: null,
        eventLabel: null,
        eventIssue: null,
        currentIssue: issue,
      }).reason,
      expected: "manual-dispatch",
    },
    {
      name: "bounded unclaimed low-risk issue is eligible",
      actual: evaluateLowRiskEligibility({
        approval: readyApproval,
        issueState: "open",
        labels: [LOW_RISK_APPROVAL_LABEL, "risk:low"],
        alreadyAssigned: false,
        alreadyClaimed: false,
        linkedOpenPr: false,
      }).eligible,
      expected: true,
    },
    {
      name: "claim blocks execution",
      actual: evaluateLowRiskEligibility({
        approval: readyApproval,
        issueState: "open",
        labels: [LOW_RISK_APPROVAL_LABEL, "risk:low"],
        alreadyAssigned: false,
        alreadyClaimed: true,
        linkedOpenPr: false,
      }).eligible,
      expected: false,
    },
    {
      name: "linked pull request blocks execution",
      actual: evaluateLowRiskEligibility({
        approval: readyApproval,
        issueState: "open",
        labels: [LOW_RISK_APPROVAL_LABEL, "risk:low"],
        alreadyAssigned: false,
        alreadyClaimed: false,
        linkedOpenPr: true,
      }).eligible,
      expected: false,
    },
    {
      name: "risk-medium label blocks execution",
      actual: evaluateLowRiskEligibility({
        approval: readyApproval,
        issueState: "open",
        labels: [LOW_RISK_APPROVAL_LABEL, "risk:low", "risk:medium"],
        alreadyAssigned: false,
        alreadyClaimed: false,
        linkedOpenPr: false,
      }).eligible,
      expected: false,
    },
  ];

  for (const testCase of cases) {
    assert(
      testCase.actual === testCase.expected,
      `${testCase.name}: expected ${String(testCase.expected)}, received ${String(testCase.actual)}`,
    );
  }

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/codex-low-risk-issue-to-pr.yml"),
    "utf8",
  );
  const prompt = fs.readFileSync(
    path.join(repoRoot, ".github/codex/prompts/low-risk-implementation.md"),
    "utf8",
  );
  const contractCases = [
    {
      name: "workflow does not subscribe to issue edits",
      actual: !/^\s+- edited\s*$/m.test(workflow),
    },
    {
      name: "workflow imports the approval policy",
      actual: workflow.includes("scripts/agent/low-risk-issue-policy.mjs"),
    },
    {
      name: "runner starts only for agent-ready approval or manual dispatch",
      actual:
        workflow.includes("github.event.label.name == 'agent:ready'") &&
        workflow.includes("github.event_name == 'workflow_dispatch'"),
    },
    {
      name: "workflow gates execution on deterministic approval",
      actual:
        workflow.includes("approval.authorized") &&
        workflow.includes("const shouldRun = eligibility.eligible"),
    },
    {
      name: "workflow writes structured untrusted issue data",
      actual:
        workflow.includes("low-risk-issue.json") &&
        workflow.includes("trust: 'untrusted'"),
    },
    {
      name: "prompt reads the structured untrusted issue data",
      actual:
        prompt.includes(".git/codex/low-risk-issue.json") &&
        prompt.includes("untrusted"),
    },
  ];

  for (const testCase of contractCases) {
    assert(testCase.actual, testCase.name);
  }

  console.log(
    `Self-test passed (${cases.length + contractCases.length} cases).`,
  );
}

if (process.argv.includes("--self-test")) {
  runSelfTests();
}
