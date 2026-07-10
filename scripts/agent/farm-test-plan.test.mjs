#!/usr/bin/env node
// Unit tests for scripts/agent/farm-test-plan.mjs (issue #488).
//
// Not wired into `pnpm test` (vitest only covers apps/web/src; there is no
// existing test harness for scripts/agent/*.mjs in this repo -- see the note in
// provider-canary.test.mjs). Run directly:
//   node --test scripts/agent/farm-test-plan.test.mjs
// Validated manually with Node's built-in test runner (no new dependency).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTestPlan,
  buildGhCommand,
  findingTitle,
  detectVerdict,
} from "./farm-test-plan.mjs";

// The trailing element is always the summary object; findings precede it.
function split(result) {
  const summary = result[result.length - 1];
  const findings = result.slice(0, -1);
  return { findings, summary };
}

test("summary object trails the findings and counts them", () => {
  const md = `## SESSION 1 Kickoff
1. Do a thing. ⚠️ a little slow
2. Do another thing. ✅
`;
  const result = parseTestPlan(md);
  const { findings, summary } = split(result);
  assert.equal(summary.kind, "summary");
  assert.equal(summary.findings, 1);
  assert.equal(findings.length, 1);
  assert.equal(summary.findings, findings.length);
});

test("parses pass (ignored), friction, and broken verdicts", () => {
  const md = `## SESSION 2 Calendar
1. Passing step. ✅
2. Friction step. ⚠️ took two taps
3. Broken step. ❌ threw an error
`;
  const { findings } = split(parseTestPlan(md));
  // ✅ ignored -> only 2 findings; ❌ sorts before ⚠️
  assert.equal(findings.length, 2);
  assert.equal(findings[0].verdict, "broken");
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].step, "3");
  assert.equal(findings[1].verdict, "friction");
  assert.equal(findings[1].severity, "medium");
  assert.equal(findings[1].step, "2");
});

test("captures a same-line note", () => {
  const md = `## SESSION 3 Sync
1. Add an event. ⚠️ needed two attempts
`;
  const { findings } = split(parseTestPlan(md));
  assert.equal(findings[0].note, "needed two attempts");
  assert.equal(findings[0].stepText, "Add an event.");
});

test("captures a following-line note and cuts stepText at Expect:", () => {
  const md = `## SESSION 4 Brief
1. Open the brief. Expect: the daily summary renders.
   ❌ it rendered blank on first load
`;
  const { findings } = split(parseTestPlan(md));
  assert.equal(findings[0].stepText, "Open the brief.");
  assert.equal(findings[0].note, "it rendered blank on first load");
});

test("emits anytime red-flags as high-severity findings", () => {
  const md = `## SESSION 5 Wins
1. Log a win. ✅

## Anytime red-flags
- ❌ App crashed on cold start twice
- normal note, no mark
`;
  const { findings } = split(parseTestPlan(md));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].session, "anytime");
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].note, /crashed on cold start/);
});

test("routes an OWNER-GATE note to the OWNER-GATE marker line", () => {
  const md = `## SESSION 6 Settings
1. Change the timezone. ❌ OWNER-GATE: needs a prod config decision
`;
  const { findings } = split(parseTestPlan(md));
  const cmd = buildGhCommand(findings[0]);
  assert.match(
    cmd,
    /- \[ \] OWNER-GATE: OWNER-GATE: needs a prod config decision/,
  );
  assert.doesNotMatch(cmd, /AGENT-TODO: reproduce and fix/);
});

test("uses the AGENT-TODO marker when no OWNER-GATE token is present", () => {
  const md = `## SESSION 7 Rollup
1. Approve the rollup. ❌ approve button did nothing
`;
  const { findings } = split(parseTestPlan(md));
  const cmd = buildGhCommand(findings[0]);
  assert.match(cmd, /- \[ \] AGENT-TODO: reproduce and fix/);
});

test("unmarked steps are absent from output", () => {
  const md = `## SESSION 8 Quiet
1. A step with no verdict at all.
2. Another unmarked step.
`;
  const { findings, summary } = split(parseTestPlan(md));
  assert.equal(findings.length, 0);
  assert.equal(summary.findings, 0);
  assert.equal(summary.skipped, 0);
});

test("malformed / orphan-mark lines are skipped, not thrown", () => {
  const md = `random preamble text
⚠️ an orphan warning with no step or section
❌ an orphan broken mark, also homeless
## SESSION 9 Real
1. A real friction step. ⚠️ mild
`;
  let result;
  assert.doesNotThrow(() => {
    result = parseTestPlan(md);
  });
  const { findings, summary } = split(result);
  assert.equal(findings.length, 1); // only the real step
  assert.equal(summary.skipped, 2); // two orphan marks
});

test("empty / nullish input never throws and yields an empty summary", () => {
  for (const input of ["", null, undefined]) {
    const result = parseTestPlan(input);
    const { findings, summary } = split(result);
    assert.equal(findings.length, 0);
    assert.equal(summary.kind, "summary");
    assert.equal(summary.skipped, 0);
  }
});

test("gh command carries repo, usability label, and truncated title", () => {
  const longStep =
    "This is a deliberately long step description that comfortably exceeds sixty characters in length for truncation";
  const md = `## SESSION 1 Long
1. ${longStep} ❌ broke badly
`;
  const { findings } = split(parseTestPlan(md));
  const cmd = buildGhCommand(findings[0]);
  assert.match(cmd, /gh issue create -R jpatel900\/LifeOS/);
  assert.match(cmd, /--label usability/);
  // Title text portion (after the "S1#1: " prefix) is capped at ~60 chars.
  const title = findingTitle(findings[0]);
  const textPortion = title.replace(/^\[test-plan\] S1#1: /, "");
  assert.ok(
    textPortion.length <= 60,
    `title text too long: ${textPortion.length}`,
  );
});

test("detectVerdict prioritises broken over friction over pass", () => {
  assert.equal(detectVerdict("all good ✅"), "pass");
  assert.equal(detectVerdict("slow ⚠️ but ok"), "friction");
  assert.equal(detectVerdict("⚠️ slow and ❌ broken"), "broken");
  assert.equal(detectVerdict("nothing here"), null);
});
