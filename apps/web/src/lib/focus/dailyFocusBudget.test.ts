import { describe, expect, it } from "vitest";
import {
  computeDailyFocusBudget,
  DEFAULT_FOCUS_BUDGET,
  deriveFreeHoursFromBlocks,
  splitByFocusBudget,
  unionIntervalHours,
  WORKING_WINDOW_HOURS,
  type CalendarBlockLike,
} from "./dailyFocusBudget";

/** Pinned clock — no ambient Date.now anywhere in these tests. */
const NOW = new Date("2026-07-05T12:00:00.000Z");

function atTodayHour(hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function block(
  overrides: Partial<CalendarBlockLike> & { start_at: string; end_at: string },
): CalendarBlockLike {
  return { status: "scheduled", ...overrides };
}

describe("computeDailyFocusBudget — documented thresholds", () => {
  it(">= 5 free hours -> 3 (empty-calendar fixture: 10 free hours)", () => {
    expect(computeDailyFocusBudget({ freeHours: WORKING_WINDOW_HOURS })).toBe(
      3,
    );
  });

  it(">= 2 and < 5 free hours -> 2 (moderate-day fixture: 3 free hours)", () => {
    expect(computeDailyFocusBudget({ freeHours: 3 })).toBe(2);
  });

  it("< 2 free hours -> 1 (packed-day fixture: 1 free hour)", () => {
    expect(computeDailyFocusBudget({ freeHours: 1 })).toBe(1);
  });

  it("boundary: exactly 5 free hours -> 3", () => {
    expect(computeDailyFocusBudget({ freeHours: 5 })).toBe(3);
  });

  it("boundary: just under 5 free hours -> 2", () => {
    expect(computeDailyFocusBudget({ freeHours: 4.99 })).toBe(2);
  });

  it("boundary: exactly 2 free hours -> 2", () => {
    expect(computeDailyFocusBudget({ freeHours: 2 })).toBe(2);
  });

  it("boundary: just under 2 free hours -> 1", () => {
    expect(computeDailyFocusBudget({ freeHours: 1.99 })).toBe(1);
  });

  it("0 free hours -> 1 (floor, never 0)", () => {
    expect(computeDailyFocusBudget({ freeHours: 0 })).toBe(1);
  });

  it("negative free hours (defensive) -> 1, not degraded", () => {
    expect(computeDailyFocusBudget({ freeHours: -3 })).toBe(1);
  });

  it("degraded: freeHours null -> DEFAULT_FOCUS_BUDGET", () => {
    expect(computeDailyFocusBudget({ freeHours: null })).toBe(
      DEFAULT_FOCUS_BUDGET,
    );
  });

  it("degraded: freeHours NaN -> DEFAULT_FOCUS_BUDGET", () => {
    expect(computeDailyFocusBudget({ freeHours: Number.NaN })).toBe(
      DEFAULT_FOCUS_BUDGET,
    );
  });

  it("DEFAULT_FOCUS_BUDGET is itself a valid 1-3 budget", () => {
    expect(DEFAULT_FOCUS_BUDGET).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_FOCUS_BUDGET).toBeLessThanOrEqual(3);
  });
});

describe("unionIntervalHours", () => {
  it("returns 0 for an empty interval list", () => {
    expect(unionIntervalHours([])).toBe(0);
  });

  it("sums disjoint intervals", () => {
    const hours = unionIntervalHours([
      { startMs: 0, endMs: 60 * 60 * 1000 },
      { startMs: 2 * 60 * 60 * 1000, endMs: 3 * 60 * 60 * 1000 },
    ]);
    expect(hours).toBe(2);
  });

  it("merges overlapping intervals instead of double-counting", () => {
    const hours = unionIntervalHours([
      { startMs: 0, endMs: 2 * 60 * 60 * 1000 },
      { startMs: 60 * 60 * 1000, endMs: 3 * 60 * 60 * 1000 },
    ]);
    // Union is [0h, 3h) = 3 hours, not 2 + 2 = 4.
    expect(hours).toBe(3);
  });

  it("merges adjacent (touching) intervals", () => {
    const hours = unionIntervalHours([
      { startMs: 0, endMs: 60 * 60 * 1000 },
      { startMs: 60 * 60 * 1000, endMs: 2 * 60 * 60 * 1000 },
    ]);
    expect(hours).toBe(2);
  });

  it("is order-independent (unsorted input)", () => {
    const hours = unionIntervalHours([
      { startMs: 2 * 60 * 60 * 1000, endMs: 3 * 60 * 60 * 1000 },
      { startMs: 0, endMs: 60 * 60 * 1000 },
    ]);
    expect(hours).toBe(2);
  });
});

describe("deriveFreeHoursFromBlocks — fixture days", () => {
  it("empty calendar -> full working window free (10 hours)", () => {
    const freeHours = deriveFreeHoursFromBlocks([], NOW);
    expect(freeHours).toBe(WORKING_WINDOW_HOURS);
    expect(computeDailyFocusBudget({ freeHours })).toBe(3);
  });

  it("moderate day (three meetings, 7 busy hours) -> 3 free hours -> budget 2", () => {
    const blocks = [
      block({ start_at: atTodayHour(8), end_at: atTodayHour(10) }), // 2h
      block({ start_at: atTodayHour(10), end_at: atTodayHour(13) }), // 3h
      block({ start_at: atTodayHour(15), end_at: atTodayHour(17) }), // 2h
    ];
    const freeHours = deriveFreeHoursFromBlocks(blocks, NOW);
    expect(freeHours).toBe(3);
    expect(computeDailyFocusBudget({ freeHours })).toBe(2);
  });

  it("packed day (back-to-back meetings, 9 busy hours) -> 1 free hour -> budget 1", () => {
    const blocks = [
      block({ start_at: atTodayHour(8), end_at: atTodayHour(12) }), // 4h
      block({ start_at: atTodayHour(12), end_at: atTodayHour(17) }), // 5h
    ];
    const freeHours = deriveFreeHoursFromBlocks(blocks, NOW);
    expect(freeHours).toBe(1);
    expect(computeDailyFocusBudget({ freeHours })).toBe(1);
  });

  it("cancelled blocks do not count as busy", () => {
    const blocks = [
      block({
        status: "cancelled",
        start_at: atTodayHour(8),
        end_at: atTodayHour(17),
      }),
    ];
    expect(deriveFreeHoursFromBlocks(blocks, NOW)).toBe(WORKING_WINDOW_HOURS);
  });

  it("blocks outside today are ignored", () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const blocks = [
      block({
        start_at: yesterday.toISOString(),
        end_at: new Date(yesterday.getTime() + 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveFreeHoursFromBlocks(blocks, NOW)).toBe(WORKING_WINDOW_HOURS);
  });

  it("blocks are clamped to the working window (early/late spillover)", () => {
    const blocks = [
      // Starts before window open, ends after window close: fully busy day.
      block({ start_at: atTodayHour(6), end_at: atTodayHour(20) }),
    ];
    expect(deriveFreeHoursFromBlocks(blocks, NOW)).toBe(0);
  });

  it("overlapping/double-booked blocks are unioned, not double-counted", () => {
    const blocks = [
      block({ start_at: atTodayHour(9), end_at: atTodayHour(12) }), // 3h
      block({ start_at: atTodayHour(10), end_at: atTodayHour(13) }), // 3h, overlaps
    ];
    // Union is [9,13) = 4 busy hours, not 6.
    const freeHours = deriveFreeHoursFromBlocks(blocks, NOW);
    expect(freeHours).toBe(WORKING_WINDOW_HOURS - 4);
  });

  it("never returns a value outside [0, WORKING_WINDOW_HOURS]", () => {
    const blocks = [
      block({ start_at: atTodayHour(0), end_at: atTodayHour(23, 59) }),
    ];
    const freeHours = deriveFreeHoursFromBlocks(blocks, NOW);
    expect(freeHours).toBeGreaterThanOrEqual(0);
    expect(freeHours).toBeLessThanOrEqual(WORKING_WINDOW_HOURS);
  });
});

describe("splitByFocusBudget", () => {
  it("splits an ordered list at the budget, preserving order", () => {
    const items = ["a", "b", "c", "d", "e"];
    const { focus, deferred } = splitByFocusBudget(items, 2);
    expect(focus).toEqual(["a", "b"]);
    expect(deferred).toEqual(["c", "d", "e"]);
  });

  it("deferred is empty when the list is within budget", () => {
    const items = ["a", "b"];
    const { focus, deferred } = splitByFocusBudget(items, 3);
    expect(focus).toEqual(["a", "b"]);
    expect(deferred).toEqual([]);
  });

  it("deferred preserves the over-budget tail rather than dropping it", () => {
    const items = [1, 2, 3, 4];
    const { deferred } = splitByFocusBudget(items, 1);
    expect(deferred).toEqual([2, 3, 4]);
  });

  it("budget 0 defers everything", () => {
    const items = ["a", "b"];
    const { focus, deferred } = splitByFocusBudget(items, 0);
    expect(focus).toEqual([]);
    expect(deferred).toEqual(["a", "b"]);
  });

  it("empty input list yields empty focus and deferred", () => {
    expect(splitByFocusBudget([], 3)).toEqual({ focus: [], deferred: [] });
  });
});
