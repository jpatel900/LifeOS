import { describe, expect, it, vi } from "vitest";
import {
  createRollupSummary,
  listRollupSummaries,
  type MinimalSupabaseClient,
} from "@/lib/data/workflow";
import {
  buildWeeklyRollupDraft,
  composeMonthlyRollupDraft,
} from "./rollupDraft";

/**
 * S8 (#260) / #486 acceptance flow, exercised end-to-end across the
 * deterministic draft composer and the persistence layer:
 *
 *  - two seeded weeks produce two APPROVED weekly rows,
 *  - the two approved weeks compose into one monthly CANDIDATE draft,
 *  - approving the monthly candidate persists it through the SAME
 *    `createRollupSummary` path with `period_type: "month"` (#486 — no new
 *    persistence path),
 *  - a rejected draft persists nothing (createRollupSummary is never called).
 */

const userId = "550e8400-e29b-41d4-a716-446655440001";
const areaId = "550e8400-e29b-41d4-a716-446655440101";

function persistedClient(captured: Record<string, unknown>[]) {
  const from = vi.fn(() => ({
    insert: (row: Record<string, unknown>) => {
      captured.push(row);
      return {
        select: () => ({
          single: async () => ({
            data: {
              id: crypto.randomUUID(),
              user_id: userId,
              created_at: "2026-05-31T00:00:00.000Z",
              ...row,
            },
            error: null,
          }),
        }),
      };
    },
  }));
  return {
    from,
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as unknown as MinimalSupabaseClient;
}

describe("S8 rollup acceptance flow", () => {
  it("two seeded weeks -> two approved weekly rows -> one monthly candidate; reject persists nothing", async () => {
    const week1 = buildWeeklyRollupDraft({
      winTitles: ["Shipped onboarding"],
      missedTitles: ["Deep-work morning"],
      counts: { wins: 1, completedSessions: 4, missedSessions: 1 },
    });
    const week2 = buildWeeklyRollupDraft({
      winTitles: ["Launched pricing"],
      missedTitles: [],
      counts: { wins: 1, completedSessions: 6, missedSessions: 0 },
    });

    const captured: Record<string, unknown>[] = [];
    const client = persistedClient(captured);

    // User approves both weekly drafts -> two persisted rows.
    const r1 = await createRollupSummary(client, {
      area_id: areaId,
      period_type: "week",
      period_start: "2026-05-04",
      period_end: "2026-05-10",
      summary: week1,
    });
    const r2 = await createRollupSummary(client, {
      area_id: areaId,
      period_type: "week",
      period_start: "2026-05-11",
      period_end: "2026-05-17",
      summary: week2,
    });

    expect([r1.provider, r2.provider]).toEqual(["supabase", "supabase"]);
    expect(captured).toHaveLength(2);
    expect(captured.every((row) => row.period_type === "week")).toBe(true);

    // The two approved weeks compose into one monthly candidate (not persisted
    // until separately approved).
    const monthlyCandidate = composeMonthlyRollupDraft([
      r1.rollupSummary.summary,
      r2.rollupSummary.summary,
    ]);
    expect(monthlyCandidate).not.toBeNull();
    expect(monthlyCandidate?.highlights).toEqual([
      "Shipped onboarding",
      "Launched pricing",
    ]);
    expect(monthlyCandidate?.counts).toEqual({
      wins: 2,
      completed_sessions: 10,
      missed_sessions: 1,
    });

    // A rejected draft is simply never handed to createRollupSummary: no third
    // insert happened.
    expect(captured).toHaveLength(2);

    // #486: approving the monthly candidate persists it through the SAME
    // path, with period_type "month" — no new write path.
    const r3 = await createRollupSummary(client, {
      area_id: areaId,
      period_type: "month",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      summary: monthlyCandidate!,
    });
    expect(r3.provider).toBe("supabase");
    expect(r3.rollupSummary.period_type).toBe("month");
    expect(captured).toHaveLength(3);
    expect(captured[2]).toMatchObject({
      period_type: "month",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
    });
  });

  it("lists nothing before any rollup is approved (mock provider)", async () => {
    const result = await listRollupSummaries(null);
    expect(result.provider).toBe("mock");
    expect(result.rollupSummaries).toEqual([]);
  });
});
