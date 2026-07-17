import { describe, expect, it } from "vitest";
import { formatMastheadDate } from "./formatMastheadDate";

describe("formatMastheadDate", () => {
  it("formats as 'Weekday D Month' with no zero-padding or comma", () => {
    // 2026-07-15 is a Wednesday (verified against a real calendar).
    expect(formatMastheadDate(new Date(2026, 6, 15))).toBe("Wednesday 15 July");
  });

  it("does not zero-pad single-digit days", () => {
    // 2026-07-04 is a Saturday.
    expect(formatMastheadDate(new Date(2026, 6, 4))).toBe("Saturday 4 July");
  });

  it("reads local date parts, not UTC", () => {
    // Local midnight on a given calendar day must format as that day
    // regardless of the host's UTC offset — constructing via
    // year/month/day (not an ISO string) keeps this test timezone-safe.
    const newYearsEve = new Date(2026, 11, 31);
    expect(formatMastheadDate(newYearsEve)).toBe("Thursday 31 December");
  });
});
