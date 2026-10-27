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
const failureDate = "2026-10-27";

function latestReadinessDate(checkpoints: string) {
  return [
    ...checkpoints.matchAll(/^- \*\*(\d{4}-\d{2}-\d{2}) — ([^*\n]+)\*\*:/gm),
  ].find((entry) => /\b(TRIAL|READINESS)\b/i.test(entry[2] ?? ""))?.[1];
}

function assertCurrentFailureSummary(
  summary: string,
  latestDate: string | undefined,
) {
  // A newer readiness checkpoint supersedes this failure-specific contract.
  // It may truthfully record a started trial and a different next action.
  if (latestDate !== failureDate) return;
  const nextAction =
    summary.split("## Next action")[1]?.split("\n## ")[0] ?? "";
  expect(summary).not.toMatch(/have not been checked by it yet/);
  expect(nextAction).not.toMatch(/wait for the next weekly smoke/i);
  expect(nextAction).toMatch(/capture visibility/i);
  expect(nextAction).toMatch(/#1026/);
  expect(summary).toMatch(/UNSET/);
  expect(summary).toMatch(/UNVERIFIED/);
}

// Evidence floor, not a success certificate: these attempts are already known
// failures. Newer evidence can supersede them without erasing the trial gates.
describe("trial readiness reflects the recorded smoke attempts (#820)", () => {
  it("records both later attempts and distinguishes wrapper success from smoke failure", () => {
    const datedFailure =
      currentProgramState
        .split("\n")
        .find((line) => line.startsWith(`- **${failureDate} —`)) ?? "";
    expect(datedFailure).toContain("39144442976");
    expect(datedFailure).toContain("40214046720");
    expect(datedFailure).toMatch(/SMOKE_OUTCOME: failure/);
    expect(datedFailure).toMatch(/wrapper/i);
    expect(datedFailure).toMatch(/before Sort/i);
  });

  it("does not direct the next agent to wait for an already-completed smoke", () => {
    const latestDate = latestReadinessDate(currentProgramState);
    expect(latestDate).toBeDefined();
    assertCurrentFailureSummary(state, latestDate);
  });

  it("retains the durable production-confirmation rule without requiring a pending status forever", () => {
    expect(program).toMatch(
      /until .+ confirms that the first real production capture appears on Start and sorts into a next step/,
    );
  });

  it("allows a later confirmed trial and a new next action", () => {
    const laterEvidence =
      "- **2026-10-28 — TRIAL START CONFIRMED:** Production capture and Sort passed.\n" +
      currentProgramState;
    const startedTrial =
      "Trial started 2026-10-28. C2 owner glance completed.\n## Next action\nUse LifeOS for the trial.";
    expect(() =>
      assertCurrentFailureSummary(
        startedTrial,
        latestReadinessDate(laterEvidence),
      ),
    ).not.toThrow();
  });

  it("still rejects stale instructions when a newer checkpoint is unrelated to readiness", () => {
    const unrelatedCheckpoint =
      "- **2026-10-28 — NAVIGATION COPY:** Labels clarified.\n" +
      currentProgramState;
    // The guard is live while the dated failure remains current, including
    // if an unrelated program note is inserted ahead of it.
    if (latestReadinessDate(currentProgramState) !== failureDate) return;
    expect(() =>
      assertCurrentFailureSummary(
        "## Next action\nWait for the next weekly smoke.",
        latestReadinessDate(unrelatedCheckpoint),
      ),
    ).toThrow();
  });
});
