import { describe, expect, it } from "vitest";
import {
  approvedRollupAreaIdsOf,
  resolveDurablyApprovedRollupKeys,
  resolvedRollupAreaId,
  rollupKey,
  type ApprovedRollupSummary,
} from "./approvedRollups";

/**
 * The id-space arithmetic behind #737 C1 ROUND 2 GAP 2, in isolation.
 *
 * The guard that reproduces the race through the real hook is
 * `src/__tests__/durableRollupOfferGuard.test.tsx`; this file pins the rules
 * that guard depends on, including the two ways a fix of this shape goes
 * wrong: suppressing a period nobody approved, and counting one approval twice
 * because it answers to two names.
 */

const PERSISTED_AREA_ID = "00000000-0000-4000-8000-000000000101";
const WORKFLOW_AREA_ID = "area-main-job";

function row(
  overrides: Partial<ApprovedRollupSummary> = {},
): ApprovedRollupSummary {
  return {
    id: "ca9a6505-17a9-4e2d-90e7-7fdcb7fb7b35",
    user_id: "00000000-0000-4000-8000-000000000001",
    area_id: PERSISTED_AREA_ID,
    areaIdAliases: [PERSISTED_AREA_ID],
    period_type: "week",
    period_start: "2026-07-23",
    period_end: "2026-07-29",
    summary: { highlights: [], misses: [], counts: {} },
    created_at: "2026-07-29T03:30:00.000Z",
    ...overrides,
  };
}

describe("rollupKey", () => {
  it("joins area, period type and period start in one string", () => {
    expect(rollupKey(WORKFLOW_AREA_ID, "week", "2026-07-23")).toBe(
      "area-main-job|week|2026-07-23",
    );
  });
});

describe("approvedRollupAreaIdsOf", () => {
  it("reports the resolved id and every alias", () => {
    expect(
      approvedRollupAreaIdsOf(row({ area_id: WORKFLOW_AREA_ID })),
    ).toStrictEqual([WORKFLOW_AREA_ID, PERSISTED_AREA_ID]);
  });

  it("reports just the id when the tier knows only one name", () => {
    expect(
      approvedRollupAreaIdsOf(row({ areaIdAliases: undefined })),
    ).toStrictEqual([PERSISTED_AREA_ID]);
  });
});

describe("resolvedRollupAreaId", () => {
  it("translates a persisted uuid once the area map has landed", () => {
    expect(
      resolvedRollupAreaId(row(), { [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID }),
    ).toBe(WORKFLOW_AREA_ID);
  });

  it("leaves an already-workflow-scoped id alone", () => {
    expect(
      resolvedRollupAreaId(row({ area_id: WORKFLOW_AREA_ID }), {
        [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID,
      }),
    ).toBe(WORKFLOW_AREA_ID);
  });

  it("returns the id unchanged before the map exists", () => {
    // Not a guess and not a throw: the caller's gate decides what to do with
    // an unresolved id, and inventing a workflow id here would be worse.
    expect(resolvedRollupAreaId(row(), {})).toBe(PERSISTED_AREA_ID);
  });
});

describe("resolveDurablyApprovedRollupKeys", () => {
  it("keys an account row in BOTH id spaces once the map has landed", () => {
    // THE FIX, stated as arithmetic. Pre-hydration the row could only be keyed
    // by uuid; the draft asks by workflow id; the two never met.
    const keys = resolveDurablyApprovedRollupKeys([row()], [], {
      [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID,
    });

    expect(keys.has("area-main-job|week|2026-07-23")).toBe(true);
    expect(
      keys.has("00000000-0000-4000-8000-000000000101|week|2026-07-23"),
    ).toBe(true);
  });

  it("recomputes from the same rows when the map arrives late", () => {
    // The row object never changes — only the map does. That is exactly the
    // sequence a mount goes through, and the reason the resolution had to move
    // out of the fetch.
    const rows = [row()];
    const before = resolveDurablyApprovedRollupKeys(rows, [], {});
    const after = resolveDurablyApprovedRollupKeys(rows, [], {
      [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID,
    });

    expect(before.has("area-main-job|week|2026-07-23")).toBe(false);
    expect(after.has("area-main-job|week|2026-07-23")).toBe(true);
  });

  it("never keys a period the account has not approved", () => {
    // Over-suppression is the failure mode a "widen the key space" fix ships.
    // Aliases may only ever add NAMES for an area, never periods.
    const keys = resolveDurablyApprovedRollupKeys([row()], [], {
      [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID,
    });

    expect(keys.has("area-main-job|week|2026-07-16")).toBe(false);
    expect(keys.has("area-main-job|month|2026-07-23")).toBe(false);
    expect(keys.has("area-personal|week|2026-07-23")).toBe(false);
  });

  it("carries the device journal tier through untouched", () => {
    // Journalled keys are already workflow-scoped (`workflow_area_id`), so
    // they need no resolution — and without them a rollup approved OFFLINE
    // would be re-offered on the next mount, the same failure one tier down.
    const keys = resolveDurablyApprovedRollupKeys(
      [],
      ["area-personal|month|2026-07-01"],
      {},
    );

    expect(keys.has("area-personal|month|2026-07-01")).toBe(true);
  });

  it("collapses a row the journal also holds into one key", () => {
    // One approval is one approval however many tiers report it; a Set is the
    // guarantee, asserted rather than assumed.
    const keys = resolveDurablyApprovedRollupKeys(
      [row()],
      ["area-main-job|week|2026-07-23"],
      { [PERSISTED_AREA_ID]: WORKFLOW_AREA_ID },
    );

    expect(keys.size).toBe(2);
  });

  it("is empty when nothing has been approved", () => {
    expect(resolveDurablyApprovedRollupKeys([], [], {}).size).toBe(0);
  });
});
