import { describe, expect, it } from "vitest";
import type { DurationProfile, OverrideRecord } from "@lifeos/schemas";
import type { Phase2MockExecutionSession } from "../types";
import {
  AREA_DURATION_TASK_TYPE,
  applyStoredDuration,
  buildPolicyProposals,
  buildProposalRecalibration,
  durationProfileForArea,
} from "./learningSurface";

let seq = 0;
function session(
  overrides: Partial<Phase2MockExecutionSession> & {
    area_id: string;
    planned_minutes: number | null;
    actual_minutes: number | null;
  },
): Phase2MockExecutionSession {
  seq += 1;
  return {
    id: `session-${seq}`,
    user_id: "user-1",
    task_id: `task-${seq}`,
    calendar_block_id: null,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "completed",
    outcome: "completed",
    cap_outcome: null,
    notes: null,
    ...overrides,
  };
}

function overrideRec(
  policy: string,
  type: OverrideRecord["override_type"],
): OverrideRecord {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    user_id: "00000000-0000-4000-8000-000000000001",
    area_id: null,
    policy_identifier: policy,
    schema_version: "meta-learning-event-v2",
    suggestion_id: null,
    subject_type: "task",
    subject_id: "00000000-0000-4000-8000-000000000abc",
    override_type: type,
    old_value_json: null,
    new_value_json: null,
    reason: null,
    created_at: `2026-05-${String(seq).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("buildProposalRecalibration", () => {
  it("returns a sourced, applied recalibration when the area's actuals run over", () => {
    // area-a: three sessions that each ran 1.4x the estimate.
    const sessions = [
      session({ area_id: "area-a", planned_minutes: 60, actual_minutes: 84 }),
      session({ area_id: "area-a", planned_minutes: 30, actual_minutes: 42 }),
      session({ area_id: "area-a", planned_minutes: 50, actual_minutes: 70 }),
    ];

    const vm = buildProposalRecalibration(sessions, "area-a", 60);
    expect(vm).not.toBeNull();
    expect(vm!.recalibration.multiplier).toBe(1.4);
    expect(vm!.recalibration.sampleCount).toBe(3);
    expect(vm!.estimateMinutes).toBe(60);
    expect(vm!.adjustedMinutes).toBe(84);
    expect(vm!.label).toBe(
      "estimated 60m; your actuals on this area run 1.4x → 84m",
    );
  });

  it("is null when the area lacks enough usable samples", () => {
    const sessions = [
      session({ area_id: "area-a", planned_minutes: 60, actual_minutes: 84 }),
      session({ area_id: "area-a", planned_minutes: 30, actual_minutes: 42 }),
    ];
    expect(buildProposalRecalibration(sessions, "area-a", 60)).toBeNull();
  });

  it("scopes samples to the proposal's area (other areas never leak in)", () => {
    const sessions = [
      session({ area_id: "area-a", planned_minutes: 60, actual_minutes: 84 }),
      session({ area_id: "area-b", planned_minutes: 60, actual_minutes: 84 }),
      session({ area_id: "area-b", planned_minutes: 60, actual_minutes: 84 }),
    ];
    // Only one area-a sample exists, so no recalibration for area-a.
    expect(buildProposalRecalibration(sessions, "area-a", 60)).toBeNull();
  });

  it("rejects a non-positive estimate", () => {
    const sessions = [
      session({ area_id: "area-a", planned_minutes: 60, actual_minutes: 84 }),
      session({ area_id: "area-a", planned_minutes: 30, actual_minutes: 42 }),
      session({ area_id: "area-a", planned_minutes: 50, actual_minutes: 70 }),
    ];
    expect(buildProposalRecalibration(sessions, "area-a", 0)).toBeNull();
  });
});

describe("buildPolicyProposals", () => {
  it("surfaces a proposal once a policy is overridden >= N of the last M", () => {
    const records = [
      overrideRec("planning.default_time_block", "edited"),
      overrideRec("planning.default_time_block", "edited"),
      overrideRec("planning.default_time_block", "rejected"),
      overrideRec("planning.default_time_block", "accepted"),
      overrideRec("planning.default_time_block", "accepted"),
    ];
    const [proposal] = buildPolicyProposals(records);
    expect(proposal.policyIdentifier).toBe("planning.default_time_block");
    expect(proposal.evidence).toBe("overridden 3 of the last 5");
  });

  it("returns nothing when there is no override pattern", () => {
    expect(buildPolicyProposals([])).toEqual([]);
  });
});

function durationProfile(
  areaId: string,
  multiplier: number,
  sampleCount = 3,
  taskType: string = AREA_DURATION_TASK_TYPE,
): DurationProfile {
  return {
    id: "00000000-0000-4000-8000-0000000000d1",
    user_id: "00000000-0000-4000-8000-000000000001",
    area_id: areaId,
    task_type: taskType,
    estimate_stats_json: { multiplier, sample_count: sampleCount },
    sample_count: sampleCount,
    last_updated_at: "2026-07-07T12:00:00.000Z",
  };
}

describe("durationProfileForArea / applyStoredDuration", () => {
  const areaId = "00000000-0000-4000-8000-00000000aaaa";

  it("finds the area's profile stored under the area sentinel", () => {
    const profiles = [durationProfile(areaId, 1.4)];
    expect(durationProfileForArea(profiles, areaId)).toBe(profiles[0]);
  });

  it("ignores a profile stored under a non-sentinel task_type", () => {
    const profiles = [durationProfile(areaId, 1.4, 3, "deep_work")];
    expect(durationProfileForArea(profiles, areaId)).toBeNull();
    expect(applyStoredDuration(profiles, areaId, 60)).toBeNull();
  });

  it("applies the stored multiplier to the estimate (evidence-key == apply-key)", () => {
    const profiles = [durationProfile(areaId, 1.4)];
    // 60m estimate, area runs 1.4x -> 84m default.
    expect(applyStoredDuration(profiles, areaId, 60)).toBe(84);
  });

  it("is null when no profile has been accepted for the area", () => {
    expect(applyStoredDuration([], areaId, 60)).toBeNull();
    expect(durationProfileForArea([], areaId)).toBeNull();
  });

  it("is null for a null area or a non-positive estimate", () => {
    const profiles = [durationProfile(areaId, 1.4)];
    expect(applyStoredDuration(profiles, null, 60)).toBeNull();
    expect(applyStoredDuration(profiles, areaId, 0)).toBeNull();
  });
});
