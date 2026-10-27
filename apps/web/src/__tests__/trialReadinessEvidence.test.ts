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
const failureCheckpoint =
  "- **2026-10-27 — TRIAL STILL UNSET; CAPTURE VISIBILITY FAILED BEFORE SORT:**";
function findHistoricalFailure(checkpoints: string) {
  return (
    checkpoints
      .split("\n")
      .find((line) => line.startsWith(failureCheckpoint)) ?? ""
  );
}

const datedFailure = findHistoricalFailure(currentProgramState);

function latestReadinessCheckpoint(checkpoints: string) {
  return [
    ...checkpoints.matchAll(/^- \*\*(\d{4}-\d{2}-\d{2}) — ([^*\n]+):\*\*/gm),
  ].find((entry) => /\b(TRIAL|READINESS)\b/i.test(entry[2] ?? ""))?.[0];
}

function assertCurrentFailureSummary(
  summary: string,
  latestCheckpoint: string | undefined,
) {
  expect(latestCheckpoint, "Missing dated readiness checkpoint").toBeDefined();
  // Checkpoints are newest first. A different readiness heading can supersede
  // this failure-specific contract even when both checkpoints share a date.
  // It may truthfully record a started trial and a different next action.
  if (latestCheckpoint !== failureCheckpoint) return;
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
    expect(datedFailure).toContain("39144442976");
    expect(datedFailure).toContain("40214046720");
    expect(datedFailure).toMatch(/SMOKE_OUTCOME: failure/);
    expect(datedFailure).toMatch(/wrapper/i);
    expect(datedFailure).toMatch(/before Sort/i);
  });

  it("does not direct the next agent to wait for an already-completed smoke", () => {
    const latestCheckpoint = latestReadinessCheckpoint(currentProgramState);
    expect(latestCheckpoint).toBeDefined();
    assertCurrentFailureSummary(state, latestCheckpoint);
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
    const latestCheckpoint = latestReadinessCheckpoint(laterEvidence);
    expect(latestCheckpoint).toBe("- **2026-10-28 — TRIAL START CONFIRMED:**");
    expect(() =>
      assertCurrentFailureSummary(startedTrial, latestCheckpoint),
    ).not.toThrow();
  });

  it.each(["NAVIGATION COPY", "TRIAL START CONFIRMED"])(
    "keeps the historical evidence when a same-day %s checkpoint is prepended",
    (heading) => {
      const sameDayEvidence =
        `- **2026-10-27 — ${heading}:** A later checkpoint.\n` +
        currentProgramState;
      expect(findHistoricalFailure(sameDayEvidence)).toBe(datedFailure);
    },
  );

  it("allows a newer same-day confirmed trial to supersede the failure summary", () => {
    const sameDayEvidence =
      "- **2026-10-27 — TRIAL START CONFIRMED:** Production capture and Sort passed.\n" +
      currentProgramState;
    const startedTrial =
      "Trial started 2026-10-27.\n## Next action\nUse LifeOS for the trial.";
    expect(() =>
      assertCurrentFailureSummary(
        startedTrial,
        latestReadinessCheckpoint(sameDayEvidence),
      ),
    ).not.toThrow();
  });

  it("still rejects stale instructions after an unrelated same-day checkpoint", () => {
    const sameDayEvidence =
      "- **2026-10-27 — NAVIGATION COPY:** Labels clarified.\n" + datedFailure;
    expect(() =>
      assertCurrentFailureSummary(
        "## Next action\nWait for the next weekly smoke.",
        latestReadinessCheckpoint(sameDayEvidence),
      ),
    ).toThrow();
  });

  it("still rejects stale instructions when a newer checkpoint is unrelated to readiness", () => {
    const unrelatedCheckpoint =
      "- **2026-10-28 — NAVIGATION COPY:** Labels clarified.\n" + datedFailure;
    // The guard is live while the dated failure remains current, including
    // if an unrelated program note is inserted ahead of it.
    const latestCheckpoint = latestReadinessCheckpoint(unrelatedCheckpoint);
    expect(latestCheckpoint).toBe(failureCheckpoint);
    expect(() =>
      assertCurrentFailureSummary(
        "## Next action\nWait for the next weekly smoke.",
        latestCheckpoint,
      ),
    ).toThrow();
  });
});
