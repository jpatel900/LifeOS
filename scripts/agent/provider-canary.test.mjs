#!/usr/bin/env node
// Unit tests for scripts/agent/provider-canary.mjs (FR-030).
//
// Not wired into `pnpm test` (vitest only covers apps/web/src; there is no
// existing test harness for scripts/agent/*.mjs in this repo). Run directly:
//   node scripts/agent/provider-canary.test.mjs
// Documented as an unverified-by-CI lane in the PR body; validated manually
// here with Node's built-in test runner (no new dependency).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONSECUTIVE_FAILURE_THRESHOLD,
  buildIssueBody,
  buildRecoveryComment,
  classifySyntheticProbe,
  decideProbeAction,
  decideTransition,
  evaluateTraceSignal,
  findExistingCanaryIssue,
  resolveFinalState,
} from "./provider-canary.mjs";

const NOW = new Date("2026-07-05T12:00:00.000Z");

function minutesAgo(m) {
  return new Date(NOW.getTime() - m * 60 * 1000).toISOString();
}

test("evaluateTraceSignal: no rows in window => no_signal", () => {
  const result = evaluateTraceSignal([], NOW);
  assert.equal(result.state, "no_signal");
});

test("evaluateTraceSignal: rows older than the window are ignored => no_signal", () => {
  const rows = [{ validation_outcome: "failed", created_at: minutesAgo(200) }];
  const result = evaluateTraceSignal(rows, NOW);
  assert.equal(result.state, "no_signal");
});

test("evaluateTraceSignal: recent successes => healthy", () => {
  const rows = [
    { validation_outcome: "passed", created_at: minutesAgo(5) },
    { validation_outcome: "passed", created_at: minutesAgo(10) },
  ];
  const result = evaluateTraceSignal(rows, NOW);
  assert.equal(result.state, "healthy");
});

test(`evaluateTraceSignal: ${CONSECUTIVE_FAILURE_THRESHOLD}+ consecutive recent failures => failing`, () => {
  const rows = [
    { validation_outcome: "failed", created_at: minutesAgo(1) },
    { validation_outcome: "failed", created_at: minutesAgo(5) },
    { validation_outcome: "failed", created_at: minutesAgo(10) },
  ];
  const result = evaluateTraceSignal(rows, NOW);
  assert.equal(result.state, "failing");
});

test("evaluateTraceSignal: a single recent failure below threshold => healthy (no false alarm)", () => {
  const rows = [
    { validation_outcome: "failed", created_at: minutesAgo(1) },
    { validation_outcome: "passed", created_at: minutesAgo(5) },
  ];
  const result = evaluateTraceSignal(rows, NOW);
  assert.equal(result.state, "healthy");
});

test("evaluateTraceSignal: one recent success after older failures ends the failure run => healthy", () => {
  const rows = [
    { validation_outcome: "passed", created_at: minutesAgo(1) },
    { validation_outcome: "failed", created_at: minutesAgo(5) },
    { validation_outcome: "failed", created_at: minutesAgo(10) },
    { validation_outcome: "failed", created_at: minutesAgo(15) },
  ];
  const result = evaluateTraceSignal(rows, NOW);
  assert.equal(result.state, "healthy");
});

test("decideProbeAction: fires on no_signal", () => {
  assert.equal(decideProbeAction({ state: "no_signal" }), true);
});

test("decideProbeAction: fires on failing (confirm before alerting)", () => {
  assert.equal(decideProbeAction({ state: "failing" }), true);
});

test("decideProbeAction: does NOT fire on healthy (cost cap, NFR-001)", () => {
  assert.equal(decideProbeAction({ state: "healthy" }), false);
});

test("classifySyntheticProbe: null result (probe could not run) => no_signal", () => {
  assert.equal(classifySyntheticProbe(null), "no_signal");
});

test("classifySyntheticProbe: HTTP 429 => failing", () => {
  assert.equal(
    classifySyntheticProbe({ ok: false, httpStatus: 429 }),
    "failing",
  );
});

test("classifySyntheticProbe: HTTP 503 => failing", () => {
  assert.equal(
    classifySyntheticProbe({ ok: false, httpStatus: 503 }),
    "failing",
  );
});

test("classifySyntheticProbe: 200 + app already auto-degraded to mock => failing", () => {
  assert.equal(
    classifySyntheticProbe({
      ok: true,
      httpStatus: 200,
      parser: "mock",
      degraded: true,
    }),
    "failing",
  );
});

test("classifySyntheticProbe: 200 + real AI parse => healthy", () => {
  assert.equal(
    classifySyntheticProbe({ ok: true, httpStatus: 200, parser: "ai" }),
    "healthy",
  );
});

test("classifySyntheticProbe: 200 + mock parser but NOT degraded (e.g. key just absent) => healthy", () => {
  // A canary that mistook ordinary "no API key configured" mock mode for an
  // outage would be a false alarm; only degraded:true is outage evidence.
  assert.equal(
    classifySyntheticProbe({
      ok: true,
      httpStatus: 200,
      parser: "mock",
      degraded: false,
    }),
    "healthy",
  );
});

test("resolveFinalState: probe result overrides trace signal", () => {
  assert.equal(resolveFinalState("healthy", "failing"), "failing");
  assert.equal(resolveFinalState("failing", "healthy"), "healthy");
});

test("resolveFinalState: no probe run falls back to trace signal, never false-alarms on no_signal", () => {
  assert.equal(resolveFinalState("no_signal", null), "healthy");
  assert.equal(resolveFinalState("failing", null), "failing");
  assert.equal(resolveFinalState("healthy", null), "healthy");
});

test("decideTransition: healthy -> failing opens an issue", () => {
  assert.equal(decideTransition("healthy", "failing"), "open_issue");
});

test("decideTransition: null (no prior issue) -> failing opens an issue", () => {
  assert.equal(decideTransition(null, "failing"), "open_issue");
});

test("decideTransition: failing -> healthy posts recovery", () => {
  assert.equal(decideTransition("failing", "healthy"), "post_recovery");
});

test("decideTransition: failing -> failing is a no_op (never spam an issue every run)", () => {
  assert.equal(decideTransition("failing", "failing"), "no_op");
});

test("decideTransition: healthy -> healthy is a no_op", () => {
  assert.equal(decideTransition("healthy", "healthy"), "no_op");
});

test("findExistingCanaryIssue: dedupes to the open, labelled issue only", () => {
  const issues = [
    { number: 1, state: "closed", labels: ["provider-canary"] },
    { number: 2, state: "open", labels: [{ name: "provider-canary" }] },
    { number: 3, state: "open", labels: ["unrelated"] },
  ];
  assert.deepEqual(findExistingCanaryIssue(issues), { number: 2 });
});

test("findExistingCanaryIssue: no matching issue => null", () => {
  assert.equal(findExistingCanaryIssue([]), null);
  assert.equal(
    findExistingCanaryIssue([{ number: 9, state: "open", labels: [] }]),
    null,
  );
});

test("buildIssueBody: is deterministic text, no secrets, mentions FR-030 degrade", () => {
  const body = buildIssueBody({
    recentFailedCount: 3,
    recentCount: 3,
    detectedAt: NOW.toISOString(),
  });
  assert.match(body, /healthy -> failing/);
  assert.match(body, /auto-degrades to the mock parser/);
  assert.doesNotMatch(body, /OPENAI_API_KEY|sk-/);
});

test("buildRecoveryComment: mentions recovery timestamp", () => {
  const comment = buildRecoveryComment({ recoveredAt: NOW.toISOString() });
  assert.match(comment, /recovered/i);
  assert.match(comment, new RegExp(NOW.getUTCFullYear().toString()));
});
