import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const state = readFileSync(resolve(repoRoot, "docs/PROJECT_STATE.md"), "utf8");
const program = readFileSync(
  resolve(repoRoot, "docs/program/final-ux-loop.md"),
  "utf8",
);
const currentProgramState =
  program.split("## 6. Program state")[1]?.split("\n> ##")[0] ?? "";
const nextAction = state.split("## Next action")[1]?.split("\n## ")[0] ?? "";

// Evidence floor, not a success certificate: these attempts are already known
// failures. Newer evidence can supersede them without erasing the trial gates.
describe("trial readiness reflects the recorded smoke attempts (#820)", () => {
  it("records both later attempts and distinguishes wrapper success from smoke failure", () => {
    expect(currentProgramState).toContain("39144442976");
    expect(currentProgramState).toContain("40214046720");
    expect(currentProgramState).toMatch(/SMOKE_OUTCOME: failure/);
    expect(currentProgramState).toMatch(/wrapper/i);
    expect(currentProgramState).toMatch(/before Sort/i);
  });

  it("does not direct the next agent to wait for an already-completed smoke", () => {
    expect(state).not.toMatch(/have not been checked by it yet/);
    expect(nextAction).not.toMatch(/wait for the next weekly smoke/i);
    expect(nextAction).toMatch(/capture visibility/i);
    expect(nextAction).toMatch(/#1026/);
  });

  it("retains the unverified readiness and owner gates", () => {
    expect(state).toMatch(/UNSET/);
    expect(state).toMatch(/UNVERIFIED/);
    expect(program).toMatch(
      /Trial start remains \*\*UNSET\*\* until Claude confirms/,
    );
    expect(state).toMatch(/owner's five-minute glance/);
  });
});
