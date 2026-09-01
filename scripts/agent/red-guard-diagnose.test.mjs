#!/usr/bin/env node
// Unit tests for the pure decision functions in
// scripts/agent/red-guard-diagnose.mjs.
//
// Not wired into `pnpm test` (vitest only covers apps/web/src; there is no
// vitest harness for scripts/agent/*.mjs in this repo). Run directly:
//   node scripts/agent/red-guard-diagnose.test.mjs
// Same convention as scripts/agent/status.test.mjs and
// scripts/agent/provider-canary.test.mjs. The CI gate for this script is the
// "Safe-automerge policy self-tests" job, which runs `--self-test`.
//
// Importing the module here must never shell out to `gh`: the module only
// does that work when run directly (the `isDirectRun` guard at its bottom).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONFIRM_LABEL,
  FIXTURES,
  VERDICTS,
  WONT_FIX_LABEL,
  classifyAttempts,
  evaluateConfirmArm,
  evaluateStandDown,
  extractSignals,
  parseMarker,
  renderDiagnosisComment,
  renderMarker,
  renderTelegramNotice,
  runSelfTest,
} from "./red-guard-diagnose.mjs";

function attempt(
  number,
  logText,
  jobNames = ["Playwright E2E (signed-in tier)"],
) {
  return {
    attempt: number,
    logsAvailable: true,
    jobNames,
    ...extractSignals(logText),
  };
}

test("extractSignals pulls the spec coordinate, mechanism, and the ✘ line", () => {
  const signals = extractSignals(FIXTURES.mainAttempt1);
  assert.deepEqual(signals.specs, ["tests/e2e/plan-port-truth.spec.ts:271"]);
  assert.ok(signals.signatures.includes("deep-equality"));
  assert.ok(signals.failureLines.some((line) => line.includes("✘")));
  // Timestamps are stripped so the quoted block reads as a test report.
  assert.ok(!signals.failureLines.some((line) => line.startsWith("2026-")));
});

test("PGRST codes are recognised as their own mechanism", () => {
  const signals = extractSignals(FIXTURES.revertRun);
  assert.ok(signals.signatures.includes("postgrest"));
  assert.deepEqual(signals.specs, [
    "tests/e2e/signed-in-account-truth.spec.ts:205",
  ]);
});

test("same spec + different mechanisms reads as nondeterminism (the real #841 case)", () => {
  const result = classifyAttempts([
    attempt(1, FIXTURES.mainAttempt1),
    attempt(2, FIXTURES.mainAttempt2),
  ]);
  assert.equal(result.verdict, VERDICTS.NONDETERMINISTIC);
  assert.match(result.headline, /revert probably will not fix this/);
  assert.match(result.detail, /attempt 1 = /);
});

test("same spec + same mechanism reads as the change being suspect", () => {
  const first = attempt(1, FIXTURES.mainAttempt1);
  const result = classifyAttempts([first, { ...first, attempt: 2 }]);
  assert.equal(result.verdict, VERDICTS.CHANGE_SUSPECT);
  assert.match(result.headline, /read the failure before reverting/);
});

test("different specs read as environment or flaky tier", () => {
  const result = classifyAttempts([
    attempt(1, FIXTURES.mainAttempt1),
    attempt(2, FIXTURES.revertRun),
  ]);
  assert.equal(result.verdict, VERDICTS.ENVIRONMENT);
  assert.match(result.headline, /revert probably will not fix this/);
});

test("unreadable logs degrade instead of guessing", () => {
  const result = classifyAttempts([
    { attempt: 1, logsAvailable: false, reason: "logs expired" },
    { attempt: 2, logsAvailable: false, reason: "logs expired" },
  ]);
  assert.equal(result.verdict, VERDICTS.INCONCLUSIVE);
  assert.match(result.detail, /diagnosis unavailable: logs expired/);
});

test("a single readable attempt never yields a cross-attempt verdict", () => {
  const result = classifyAttempts([
    attempt(1, FIXTURES.mainAttempt1),
    { attempt: 2, logsAvailable: false, reason: "logs expired" },
  ]);
  assert.equal(result.verdict, VERDICTS.INCONCLUSIVE);
  assert.match(result.detail, /Only one attempt/);
});

test("the diagnosis comment states the hold and round-trips its marker", () => {
  const classification = classifyAttempts([
    attempt(1, FIXTURES.mainAttempt1),
    attempt(2, FIXTURES.mainAttempt2),
  ]);
  const marker = renderMarker({
    failedRunId: "31039290572",
    failedJobNames: ["Playwright E2E (signed-in tier)"],
    verdict: classification.verdict,
  });
  const body = renderDiagnosisComment({
    classification,
    attempts: [attempt(1, FIXTURES.mainAttempt1)],
    runUrl: "https://example.invalid/run",
    marker,
  });
  assert.match(body, /This revert is HELD/);
  assert.match(body, new RegExp(CONFIRM_LABEL));
  const parsed = parseMarker([{ body: "unrelated" }, { body }]);
  assert.equal(parsed.failedRunId, "31039290572");
  assert.deepEqual(parsed.failedJobNames, ["Playwright E2E (signed-in tier)"]);
});

test("the Telegram notice is at most two lines and names the hold", () => {
  const classification = classifyAttempts([
    attempt(1, FIXTURES.mainAttempt1),
    attempt(2, FIXTURES.mainAttempt2),
  ]);
  const notice = renderTelegramNotice({
    prNumber: 841,
    prUrl: "https://example.invalid/pr/841",
    classification,
  });
  assert.ok(notice.split("\n").length <= 2);
  assert.match(notice, /HELD/);
});

test("confirm-to-arm only arms on a human label, never against wont-fix", () => {
  const base = {
    state: "OPEN",
    headRef: "guard/revert-main-360cce42",
    title: "",
    body: "",
  };
  assert.equal(
    evaluateConfirmArm({ ...base, labels: [CONFIRM_LABEL] }).arm,
    true,
  );
  assert.equal(evaluateConfirmArm({ ...base, labels: [] }).arm, false);
  const conflict = evaluateConfirmArm({
    ...base,
    labels: [CONFIRM_LABEL, WONT_FIX_LABEL],
  });
  assert.equal(conflict.arm, false);
  assert.match(conflict.comment, /would not restore green/);
  assert.equal(
    evaluateConfirmArm({
      ...base,
      labels: [CONFIRM_LABEL],
      headRef: "claude/red-guard-notify-hold",
    }).arm,
    false,
  );
});

test("confirm-to-arm never arms an owner-gated revert PR, even confirmed", () => {
  const base = {
    state: "OPEN",
    headRef: "guard/revert-main-360cce42",
    labels: [CONFIRM_LABEL],
    title: "",
  };
  assert.equal(
    evaluateConfirmArm({
      ...base,
      body: "## OWNER RATIFICATION REQUIRED\n\nSomeone edited this in.",
    }).arm,
    false,
  );
  assert.equal(
    evaluateConfirmArm({ ...base, body: null }).arm,
    false,
    "unreadable body fails closed",
  );
});

test("stand-down fires only on a same-named failing job, and disarms if armed", () => {
  const fired = evaluateStandDown({
    mainFailedJobNames: [
      "Playwright E2E (signed-in tier)",
      "Monorepo Validation",
    ],
    revertFailedJobNames: ["Playwright E2E (signed-in tier)"],
    autoMergeArmed: true,
  });
  assert.equal(fired.standDown, true);
  assert.equal(fired.disarm, true);
  assert.match(fired.comment, /does not fix main/);

  const different = evaluateStandDown({
    mainFailedJobNames: ["Playwright E2E (signed-in tier)"],
    revertFailedJobNames: ["Monorepo Validation"],
    autoMergeArmed: true,
  });
  assert.equal(different.standDown, false);

  const unknown = evaluateStandDown({
    mainFailedJobNames: [],
    revertFailedJobNames: ["Monorepo Validation"],
    autoMergeArmed: false,
  });
  assert.equal(unknown.standDown, false);
});

test("the CI --self-test entry point passes", () => {
  runSelfTest();
});
