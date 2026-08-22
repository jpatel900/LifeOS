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
  classifySignIn,
  classifySyntheticProbe,
  decideProbeAction,
  decideTransition,
  evaluateTraceSignal,
  findExistingCanaryIssue,
  resolveFinalState,
  runAuthenticatedProbe,
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

test("decideProbeAction: does NOT fire on healthy with zero recent failures", () => {
  assert.equal(
    decideProbeAction({ state: "healthy", recentFailedCount: 0 }),
    false,
  );
});

test("decideProbeAction: fires on a sub-threshold recent failure (masking-loop guard)", () => {
  // Now that the probe authenticates, a failing tick writes a real
  // ai_call_traces row (recordTraceRow in parseCaptureService.ts fires
  // whenever parser==="ai", including the failure path, BEFORE any
  // mock-degrade). fetchRecentTraceRows has no user_id filter, so the
  // canary's own probe becomes part of the very signal the next tick reads.
  // Without this guard: tick N (no_signal) probes, confirms failing (1
  // failed row written). Tick N+1 sees that ONE row -- consecutiveFailed=1,
  // below CONSECUTIVE_FAILURE_THRESHOLD(3) -- so evaluateTraceSignal reports
  // "healthy" and the old decideProbeAction (state-only) would skip probing,
  // so a still-ongoing outage would be reported "healthy" and the incident
  // issue closed 30 minutes into a live outage. Firing whenever
  // recentFailedCount > 0 (regardless of state) re-confirms every tick
  // while any recent failure is on record, closing that gap.
  assert.equal(
    decideProbeAction({ state: "healthy", recentFailedCount: 1 }),
    true,
  );
});

test("classifySyntheticProbe: null result (probe could not run) => no_signal", () => {
  assert.equal(classifySyntheticProbe(null), "no_signal");
});

test("classifySyntheticProbe: HTTP 401 => misconfigured, NOT failing (#684 regression)", () => {
  // 2026-07-18 incident: PR #684 added an auth gate to /api/parse-capture;
  // the unauthenticated synthetic probe 401'd on every tick and this used
  // to classify that as "failing", reporting a false provider outage for
  // three weeks straight. A 401 proves the canary itself is misconfigured,
  // not that the provider is down.
  assert.equal(
    classifySyntheticProbe({ ok: false, httpStatus: 401 }),
    "misconfigured",
  );
});

test("classifySyntheticProbe: HTTP 403 => misconfigured, NOT failing", () => {
  assert.equal(
    classifySyntheticProbe({ ok: false, httpStatus: 403 }),
    "misconfigured",
  );
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

test("classifySignIn: null result (sign-in could not be attempted) => misconfigured", () => {
  assert.equal(classifySignIn(null), "misconfigured");
});

test("classifySignIn: sign-in rejected (bad credentials / rotated password) => misconfigured, NOT failing", () => {
  // A sign-in failure is the canary's OWN setup problem (bad/rotated
  // SMOKE_EMAIL/SMOKE_PASSWORD, Supabase misconfigured) -- never evidence
  // the AI PROVIDER is down. Must classify the same way a probe-side 401/403
  // does (#874's original fix), never "failing".
  assert.equal(
    classifySignIn({ ok: false, httpStatus: 400 }),
    "misconfigured",
  );
});

test("classifySignIn: ok but no access token in the response => misconfigured", () => {
  assert.equal(classifySignIn({ ok: true, accessToken: null }), "misconfigured");
  assert.equal(classifySignIn({ ok: true, accessToken: "" }), "misconfigured");
  assert.equal(classifySignIn({ ok: true }), "misconfigured");
});

test("classifySignIn: successful sign-in with a token => proceed (null)", () => {
  assert.equal(classifySignIn({ ok: true, accessToken: "a-real-token" }), null);
});

test("runAuthenticatedProbe: sign-in failure => misconfigured, probe is never called (not reported as a provider outage)", async () => {
  let probeCalled = false;
  const warnings = [];
  const state = await runAuthenticatedProbe({
    smokeEmail: "smoke@example.com",
    smokePassword: "wrong-password",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
    baseUrl: "https://app.example.com",
    signInImpl: async () => ({ ok: false, httpStatus: 400 }),
    probeImpl: async () => {
      probeCalled = true;
      return { ok: true, httpStatus: 200, parser: "ai" };
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(state, "misconfigured");
  assert.equal(probeCalled, false, "the synthetic probe must not run without a token");
  assert.ok(
    warnings.some((message) => /sign.?in/i.test(message)),
    "a misconfigured sign-in should warn, distinctly from the probe-rejected case",
  );
});

test("runAuthenticatedProbe: sign-in success => probe runs with the minted token and its classification wins", async () => {
  const state = await runAuthenticatedProbe({
    smokeEmail: "smoke@example.com",
    smokePassword: "correct-password",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
    baseUrl: "https://app.example.com",
    signInImpl: async () => ({ ok: true, accessToken: "minted-token-123" }),
    probeImpl: async ({ accessToken }) => {
      assert.equal(accessToken, "minted-token-123");
      return { ok: true, httpStatus: 200, parser: "ai" };
    },
    warn: () => {},
  });

  assert.equal(state, "healthy");
});

test("runAuthenticatedProbe: never logs the access token, on success or on a rejected probe", async () => {
  const logged = [];
  const fakeToken = "SUPER-SECRET-ACCESS-TOKEN-DO-NOT-LOG";

  await runAuthenticatedProbe({
    smokeEmail: "smoke@example.com",
    smokePassword: "correct-password",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
    baseUrl: "https://app.example.com",
    signInImpl: async () => ({ ok: true, accessToken: fakeToken }),
    probeImpl: async () => ({ ok: false, httpStatus: 401 }),
    warn: (message) => logged.push(message),
    log: (message) => logged.push(message),
  });

  assert.ok(
    !logged.some((line) => line.includes(fakeToken)),
    "the minted access token must never appear in any logged line",
  );
});

test("runAuthenticatedProbe: sign-in failure warning names only the HTTP status, never the response body (email/password must not leak into public Actions logs)", async () => {
  const warnings = [];
  await runAuthenticatedProbe({
    smokeEmail: "smoke@example.com",
    smokePassword: "wrong-password",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon-key",
    baseUrl: "https://app.example.com",
    signInImpl: async () => ({ ok: false, httpStatus: 400 }),
    warn: (message) => warnings.push(message),
  });

  const joined = warnings.join("\n");
  assert.match(joined, /400/);
  assert.doesNotMatch(joined, /smoke@example\.com/);
  assert.doesNotMatch(joined, /wrong-password/);
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

test("resolveFinalState: misconfigured probe (auth-blocked) surfaces distinctly, not as failing", () => {
  assert.equal(resolveFinalState("healthy", "misconfigured"), "misconfigured");
  assert.equal(
    resolveFinalState("no_signal", "misconfigured"),
    "misconfigured",
  );
});

test("resolveFinalState: a trace-confirmed failure is never hidden behind an auth-blocked probe", () => {
  assert.equal(resolveFinalState("failing", "misconfigured"), "failing");
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
