import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #820 doc-truth guard: `docs/PROJECT_STATE.md` must name the same new-feature
 * exceptions to the trial freeze as the machine-readable program state.
 *
 * `docs/program/campaigns.json` (`trial.development`) and program rule R8 in
 * `docs/program/final-ux-loop.md` name FR-049 AND FR-028 (owner decision
 * 2026-09-29). PROJECT_STATE's "Current objective" said FR-049 was the
 * "sole exception", which steers agents away from ratified FR-028 work.
 * campaigns.json is the source of truth; this test only checks that the
 * status summary does not contradict it.
 */
const repoRoot = resolve(__dirname, "../../../..");

function featureExceptionIds(text: string) {
  return [...new Set(text.match(/FR-\d{3}/g) ?? [])].sort();
}

function currentObjective() {
  const state = readFileSync(
    resolve(repoRoot, "docs/PROJECT_STATE.md"),
    "utf8",
  );
  const start = state.indexOf("## Current objective");
  expect(start, "PROJECT_STATE.md lost its Current objective section").not.toBe(
    -1,
  );
  const next = state.indexOf("\n## ", start + 1);
  return state.slice(start, next === -1 ? undefined : next);
}

describe("PROJECT_STATE feature exceptions match the program (#820)", () => {
  const campaigns = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/program/campaigns.json"), "utf8"),
  ) as { trial: { development: string } };
  const programIds = featureExceptionIds(campaigns.trial.development);

  it("reads at least one exception from campaigns.json", () => {
    expect(programIds.length).toBeGreaterThan(0);
  });

  it("names every program exception in the Current objective", () => {
    const objectiveIds = featureExceptionIds(currentObjective());
    for (const id of programIds) {
      expect(objectiveIds, `PROJECT_STATE.md does not name ${id}`).toContain(
        id,
      );
    }
  });

  it("does not call a single exception the only one when the program names more", () => {
    if (programIds.length < 2) return;
    expect(currentObjective()).not.toMatch(/\b(sole|only) exception\b/i);
  });
});
