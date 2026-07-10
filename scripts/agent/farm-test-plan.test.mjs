import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  composeGhIssueCommand,
  composeIssueBody,
  composeOutput,
  parseFarmTestPlan,
} from "./farm-test-plan.mjs";

function findingsOnly(parsed) {
  return parsed.filter((item) => !item.summary);
}

function summaryOf(parsed) {
  return parsed.at(-1).summary;
}

describe("farm test plan parser", () => {
  it("parses pass/friction/broken marks and ignores passing steps", () => {
    const parsed = parseFarmTestPlan(`
## SESSION 1 Capture basics
1. Save a clean capture [ ] ✅ works
2. Edit a draft [ ] ⚠️ confusing button
3. Submit broken audio [ ] ❌ upload failed
`);

    assert.deepEqual(
      findingsOnly(parsed).map((finding) => finding.verdict),
      ["❌", "⚠️"],
    );
    assert.equal(findingsOnly(parsed)[0].severity, "high");
    assert.equal(findingsOnly(parsed)[1].severity, "medium");
  });

  it("captures same-line notes and following-line notes", () => {
    const parsed = parseFarmTestPlan(`
## SESSION two Triage
1. Open inbox [ ] ⚠️ same line note
2. Drag card to today [ ] ❌
Following line note stays verbatim.
`);

    const findings = findingsOnly(parsed);
    assert.equal(findings[1].note, "same line note");
    assert.equal(findings[0].note, "Following line note stays verbatim.");
  });

  it("emits anytime red-flags as high-severity findings", () => {
    const parsed = parseFarmTestPlan(`
## Anytime red-flags
- ❌ Calendar wrote without approval
`);

    assert.deepEqual(findingsOnly(parsed), [
      {
        session: "anytime",
        step: 1,
        stepText: "Calendar wrote without approval",
        verdict: "❌",
        severity: "high",
        note: "Calendar wrote without approval",
      },
    ]);
  });

  it("routes OWNER-GATE notes to OWNER-GATE checkbox lines", () => {
    const body = composeIssueBody({
      session: "SESSION 3 Review",
      step: 4,
      stepText: "Approve policy",
      verdict: "⚠️",
      note: "OWNER-GATE: choose the policy wording",
    });

    assert.match(
      body,
      /- \[ \] OWNER-GATE: OWNER-GATE: choose the policy wording/,
    );
    assert.doesNotMatch(body, /AGENT-TODO/);
  });

  it("omits unmarked steps", () => {
    const parsed = parseFarmTestPlan(`
## SESSION 4 Execute
1. Start focus block [ ]
2. Recover missed block [ ] ⚠️ recovery copy unclear
`);

    assert.equal(findingsOnly(parsed).length, 1);
    assert.equal(findingsOnly(parsed)[0].step, 2);
  });

  it("skips malformed marked input without throwing", () => {
    const parsed = parseFarmTestPlan(`
❌ no session or numbered step
## SESSION 5 Health
not a step ⚠️ stray mark
1. View score [ ] ❌ score mismatch
`);

    assert.equal(findingsOnly(parsed).length, 1);
    assert.equal(summaryOf(parsed).skipped, 2);
  });

  it("composes gh command text with label, truncated title, and marker line", () => {
    const command = composeGhIssueCommand({
      session: "SESSION 7 Long title",
      step: 12,
      stepText:
        "This is a very long step description that should be trimmed before the command title finishes",
      verdict: "❌",
      note: "the owner note",
    });

    assert.match(command, /^gh issue create -R 'jpatel900\/LifeOS'/);
    assert.match(command, /--label 'usability'/);
    assert.match(
      command,
      /--title '\[test-plan\] S7#12: This is a very long step description that should be trimm\.\.\.'/,
    );
    assert.match(command, /- \[ \] AGENT-TODO: reproduce and fix/);
  });

  it("adds a summary object with finding and skipped counts", () => {
    const parsed = parseFarmTestPlan(`
⚠️ malformed marked line
## SESSION 6 Review
1. Open daily review [ ] ⚠️ needs clearer heading
2. Open weekly review [ ] ❌ missing history
`);

    assert.deepEqual(summaryOf(parsed), { findings: 2, skipped: 1 });
  });

  it("prints JSON plus gh commands when --gh output is requested", () => {
    const parsed = parseFarmTestPlan(`
## SESSION 1 Capture
1. Save [ ] ⚠️ awkward
`);
    const output = composeOutput(parsed, { gh: true });

    assert.match(output, /^\[/);
    assert.match(output, /gh issue create/);
    assert.match(output, /--label 'usability'/);
  });
});
