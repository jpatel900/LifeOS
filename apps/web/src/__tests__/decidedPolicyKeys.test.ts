import { describe, expect, it } from "vitest";
import type { SuggestionRecord } from "@lifeos/schemas";
import { decidedPolicyKeysFromSuggestionRecords } from "@/lib/WorkflowContext";

/**
 * E2 (#261 follow-up): the seed that keeps a decided policy proposal suppressed
 * across reloads. Only `policy_change` records count (each IS a recorded
 * decision), and the key must match `policyProposalKey`'s `policy::area` format
 * (empty area segment when area_id is null) or suppression silently breaks.
 */
function rec(overrides: Partial<SuggestionRecord>): SuggestionRecord {
  return {
    suggestion_type: "policy_change",
    policy_identifier: "planning.default_time_block",
    area_id: null,
    ...overrides,
  } as SuggestionRecord;
}

describe("decidedPolicyKeysFromSuggestionRecords (E2)", () => {
  it("keys each policy_change decision as policy::area", () => {
    expect(
      decidedPolicyKeysFromSuggestionRecords([
        rec({
          policy_identifier: "planning.default_time_block",
          area_id: "area-1",
        }),
      ]),
    ).toEqual(["planning.default_time_block::area-1"]);
  });

  it("uses an empty area segment when area_id is null (matches policyProposalKey)", () => {
    expect(
      decidedPolicyKeysFromSuggestionRecords([
        rec({ policy_identifier: "wip.default_cap", area_id: null }),
      ]),
    ).toEqual(["wip.default_cap::"]);
  });

  it("ignores suggestion records that are not policy_change decisions", () => {
    expect(
      decidedPolicyKeysFromSuggestionRecords([
        rec({ suggestion_type: "duration_recalibration", area_id: "area-1" }),
        rec({ suggestion_type: "triage_suggestion" }),
        rec({ policy_identifier: "planning.x", area_id: "area-2" }),
      ]),
    ).toEqual(["planning.x::area-2"]);
  });

  it("returns no keys for an empty list", () => {
    expect(decidedPolicyKeysFromSuggestionRecords([])).toEqual([]);
  });
});
