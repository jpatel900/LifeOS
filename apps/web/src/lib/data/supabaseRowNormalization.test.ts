import { describe, expect, it } from "vitest";
import {
  normalizeSupabaseRow,
  normalizeSupabaseRows,
} from "./supabaseRowNormalization";

function normalized(value: unknown) {
  return (normalizeSupabaseRow({ value }) as { value: unknown }).value;
}

describe("normalizeSupabaseRow timestamps", () => {
  // The shape a real `timestamptz` read returns: offset plus microseconds.
  it("converts a six-digit offset timestamp to the same UTC instant without losing any fraction digits", () => {
    expect(normalized("2026-09-13T04:10:17.417675-04:00")).toBe(
      "2026-09-13T08:10:17.417675Z",
    );
  });

  it("keeps microseconds on a +00:00 timestamp", () => {
    expect(normalized("2026-09-13T08:10:17.417675+00:00")).toBe(
      "2026-09-13T08:10:17.417675Z",
    );
  });

  it("keeps microseconds on a Z timestamp", () => {
    expect(normalized("2026-09-13T08:10:17.417675Z")).toBe(
      "2026-09-13T08:10:17.417675Z",
    );
  });

  it("rolls the UTC day forward for a negative offset late in the day, fraction intact", () => {
    expect(normalized("2026-09-13T22:10:17.000001-04:00")).toBe(
      "2026-09-14T02:10:17.000001Z",
    );
  });

  it("rolls the UTC year back for a positive offset just after midnight on New Year's Day, fraction intact", () => {
    expect(normalized("2027-01-01T00:30:00.123456+05:30")).toBe(
      "2026-12-31T19:00:00.123456Z",
    );
  });

  it("never rounds: a fraction just under the next second stays in the same second", () => {
    expect(normalized("2026-09-13T08:10:59.999999Z")).toBe(
      "2026-09-13T08:10:59.999999Z",
    );
  });

  it("keeps a fraction below one millisecond", () => {
    expect(normalized("2026-09-13T08:10:17.000400+00:00")).toBe(
      "2026-09-13T08:10:17.0004Z",
    );
  });

  it("drops only trailing zeros past the millisecond digit, so one instant has one spelling", () => {
    expect(normalized("2026-09-13T08:10:17.417600+00:00")).toBe(
      "2026-09-13T08:10:17.4176Z",
    );
    expect(normalized("2026-09-13T08:10:17.41760+00:00")).toBe(
      "2026-09-13T08:10:17.4176Z",
    );
    expect(normalized("2026-09-13T08:10:17.417000+00:00")).toBe(
      "2026-09-13T08:10:17.417Z",
    );
  });

  it("keeps the existing millisecond and no-fraction results", () => {
    expect(normalized("2026-07-04T09:00:00.000Z")).toBe(
      "2026-07-04T09:00:00.000Z",
    );
    expect(normalized("2026-07-04T09:00:00.4+00:00")).toBe(
      "2026-07-04T09:00:00.400Z",
    );
    expect(normalized("2026-07-04T05:00:00-04:00")).toBe(
      "2026-07-04T09:00:00.000Z",
    );
  });

  it("leaves invalid dates and non-date values unchanged", () => {
    expect(normalized("2026-13-40T09:00:00.417675+00:00")).toBe(
      "2026-13-40T09:00:00.417675+00:00",
    );
    expect(normalized("2026-07-04")).toBe("2026-07-04");
    expect(normalized("not a date")).toBe("not a date");
    expect(normalized("2026-07-04T09:00:00.123+0000")).toBe(
      "2026-07-04T09:00:00.123+0000",
    );
    expect(normalized(42)).toBe(42);
    expect(normalized(null)).toBeNull();
    expect(normalized(true)).toBe(true);
  });
});

describe("normalizeSupabaseRow / normalizeSupabaseRows shape", () => {
  it("normalizes only timestamp-shaped values and keeps every key", () => {
    expect(
      normalizeSupabaseRow({
        id: "task-1",
        title: "2026-07-04 plan",
        estimated_minutes_low: 30,
        due_at: null,
        updated_at: "2026-09-13T04:10:17.417675-04:00",
      }),
    ).toEqual({
      id: "task-1",
      title: "2026-07-04 plan",
      estimated_minutes_low: 30,
      due_at: null,
      updated_at: "2026-09-13T08:10:17.417675Z",
    });
  });

  it("returns non-object rows unchanged", () => {
    const list = [1, 2];
    expect(normalizeSupabaseRow(null)).toBeNull();
    expect(normalizeSupabaseRow("row")).toBe("row");
    expect(normalizeSupabaseRow(list)).toBe(list);
  });

  it("maps every row of an array and returns non-arrays unchanged", () => {
    expect(
      normalizeSupabaseRows([
        { updated_at: "2026-09-13T04:10:17.417675-04:00" },
        { updated_at: "2026-07-04T09:00:00.000Z" },
      ]),
    ).toEqual([
      { updated_at: "2026-09-13T08:10:17.417675Z" },
      { updated_at: "2026-07-04T09:00:00.000Z" },
    ]);
    const row = { updated_at: "2026-07-04T09:00:00.000Z" };
    expect(normalizeSupabaseRows(row)).toBe(row);
    expect(normalizeSupabaseRows(null)).toBeNull();
  });
});
