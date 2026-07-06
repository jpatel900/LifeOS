import { describe, expect, it } from "vitest";
import type { OverrideRecord } from "@lifeos/schemas";
import {
  DEFAULT_OVERRIDE_PATTERN_CONFIG,
  scanOverridePatterns,
} from "./overrideScan";

let seq = 0;
function rec(
  overrides: Partial<OverrideRecord> & {
    policy: string;
    type: OverrideRecord["override_type"];
  },
): OverrideRecord {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    user_id: "00000000-0000-4000-8000-000000000001",
    area_id: overrides.area_id ?? null,
    policy_identifier: overrides.policy,
    schema_version: "2.0",
    suggestion_id: null,
    subject_type: "task",
    subject_id: "00000000-0000-4000-8000-000000000abc",
    override_type: overrides.type,
    old_value_json: null,
    new_value_json: null,
    reason: null,
    created_at: overrides.created_at ?? `2026-05-${String(seq).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("scanOverridePatterns", () => {
  it("proposes a change when a policy is overridden >= N of the last M", () => {
    const records = [
      rec({ policy: "planning.default_time_block", type: "edited" }),
      rec({ policy: "planning.default_time_block", type: "edited" }),
      rec({ policy: "planning.default_time_block", type: "rejected" }),
      rec({ policy: "planning.default_time_block", type: "accepted" }),
      rec({ policy: "planning.default_time_block", type: "accepted" }),
    ];

    const [candidate] = scanOverridePatterns(records);
    expect(candidate.policyIdentifier).toBe("planning.default_time_block");
    expect(candidate.overrideCount).toBe(3);
    expect(candidate.examined).toBe(5);
    expect(candidate.evidence).toBe("overridden 3 of the last 5");
  });

  it("does not propose when acceptances keep overrides under the threshold", () => {
    const records = [
      rec({ policy: "triage.default_accept_task", type: "edited" }),
      rec({ policy: "triage.default_accept_task", type: "accepted" }),
      rec({ policy: "triage.default_accept_task", type: "accepted" }),
      rec({ policy: "triage.default_accept_task", type: "accepted" }),
      rec({ policy: "triage.default_accept_task", type: "accepted" }),
    ];

    expect(scanOverridePatterns(records)).toEqual([]);
  });

  it("only counts the most recent M decisions, ignoring older overrides", () => {
    const records = [
      // 4 old overrides (outside the window of 5 once newer accepts arrive)
      rec({ policy: "p", type: "edited", created_at: "2026-05-01T00:00:00.000Z" }),
      rec({ policy: "p", type: "edited", created_at: "2026-05-02T00:00:00.000Z" }),
      rec({ policy: "p", type: "edited", created_at: "2026-05-03T00:00:00.000Z" }),
      // 5 recent acceptances
      rec({ policy: "p", type: "accepted", created_at: "2026-05-10T00:00:00.000Z" }),
      rec({ policy: "p", type: "accepted", created_at: "2026-05-11T00:00:00.000Z" }),
      rec({ policy: "p", type: "accepted", created_at: "2026-05-12T00:00:00.000Z" }),
      rec({ policy: "p", type: "accepted", created_at: "2026-05-13T00:00:00.000Z" }),
      rec({ policy: "p", type: "accepted", created_at: "2026-05-14T00:00:00.000Z" }),
    ];

    expect(scanOverridePatterns(records)).toEqual([]);
  });

  it("scopes by area — the same policy in different areas is judged separately", () => {
    const area1 = "00000000-0000-4000-8000-0000000000a1";
    const area2 = "00000000-0000-4000-8000-0000000000a2";
    const records = [
      rec({ policy: "planning.x", type: "edited", area_id: area1 }),
      rec({ policy: "planning.x", type: "edited", area_id: area1 }),
      rec({ policy: "planning.x", type: "replaced", area_id: area1 }),
      // area2: mostly accepted -> no proposal
      rec({ policy: "planning.x", type: "edited", area_id: area2 }),
      rec({ policy: "planning.x", type: "accepted", area_id: area2 }),
      rec({ policy: "planning.x", type: "accepted", area_id: area2 }),
    ];

    const candidates = scanOverridePatterns(records);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].areaId).toBe(area1);
    expect(candidates[0].overrideCount).toBe(3);
  });

  it("orders candidates by override count, most-overridden first", () => {
    const records = [
      rec({ policy: "a", type: "edited" }),
      rec({ policy: "a", type: "edited" }),
      rec({ policy: "a", type: "edited" }),
      rec({ policy: "b", type: "edited" }),
      rec({ policy: "b", type: "edited" }),
      rec({ policy: "b", type: "edited" }),
      rec({ policy: "b", type: "edited" }),
    ];

    const candidates = scanOverridePatterns(records, {
      windowSize: 5,
      minOverrides: 3,
    });
    expect(candidates.map((c) => c.policyIdentifier)).toEqual(["b", "a"]);
  });

  it("exposes the default config (5-window, 3-override threshold)", () => {
    expect(DEFAULT_OVERRIDE_PATTERN_CONFIG).toEqual({
      windowSize: 5,
      minOverrides: 3,
    });
  });
});
