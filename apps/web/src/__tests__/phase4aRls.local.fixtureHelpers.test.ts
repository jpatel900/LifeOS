import { RollupSummaryContentSchema } from "@lifeos/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createFutureDateReservation,
  rollupReplaySummary,
} from "./phase4aRls.fixtureHelpers";

function clientWithLatestDate(
  column: "viewed_on" | "checked_on",
  date: string | null,
  error: { message: string } | null = null,
) {
  const limit = vi.fn().mockResolvedValue({
    data: date ? [{ [column]: date }] : [],
    error,
  });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    order,
    limit,
  };
}

describe("Phase 4A database fixture contracts", () => {
  it("keeps replay summaries readable by the real account schema", () => {
    expect(
      RollupSummaryContentSchema.parse(rollupReplaySummary("Replay fixture")),
    ).toEqual({ highlights: ["Replay fixture"], misses: [], counts: {} });
  });

  it("reserves distinct dates beyond rows already held by either user", async () => {
    const userA = clientWithLatestDate("viewed_on", "2080-01-01");
    const userB = clientWithLatestDate("viewed_on", "2080-01-05");
    const reserve = createFutureDateReservation();
    const first = await reserve(
      [userA.client, userB.client],
      "brief_views",
      "viewed_on",
    );
    const second = await reserve([userA.client], "brief_views", "viewed_on");

    expect(first).toBe("2080-01-06");
    expect(second).toBe("2080-01-07");
    expect(userB.from).toHaveBeenCalledWith("brief_views");
    expect(userA.order).toHaveBeenCalledWith("viewed_on", { ascending: false });
    expect(userA.limit).toHaveBeenCalledWith(1);
  });

  it("keeps a new run beyond append-only rows left by a previous run", async () => {
    const previous = clientWithLatestDate("checked_on", "2087-09-20");
    expect(
      await createFutureDateReservation()(
        [previous.client],
        "purpose_gauge_checkins",
        "checked_on",
      ),
    ).toBe("2087-09-21");
  });

  it("fails when existing fixture dates cannot be read", async () => {
    const failed = clientWithLatestDate("viewed_on", null, {
      message: "fixture read failed",
    });
    await expect(
      createFutureDateReservation()(
        [failed.client],
        "brief_views",
        "viewed_on",
      ),
    ).rejects.toThrow("fixture read failed");
  });
});
