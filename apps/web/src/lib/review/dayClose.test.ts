import { describe, expect, it } from "vitest";
import {
  DAILY_CLOSE_INDEX,
  isDailyCloseConflict,
  localIsoDate,
  resolveDayClose,
} from "./dayClose";

/**
 * Final UX Loop C1, Target Cards 1+7 (audit P0#4).
 *
 * Every case here is written from LOCAL wall-clock components
 * (`new Date(year, monthIndex, day, hour, ...)`), never from a `Z` string, so
 * the assertions hold in every timezone the suite is ever run in — including
 * CI's UTC. That is the whole point of the module: the app had two date
 * derivations that agreed only some of the time, in some places.
 */
describe("localIsoDate", () => {
  it("returns the LOCAL calendar day, not the UTC one", () => {
    // 23:30 local on 2026-07-27. Anywhere west of Greenwich this instant is
    // already 2026-07-28 in UTC; east of it, 2026-07-27 late evening. Either
    // way the user's day is the 27th, and that is what a close must be filed
    // under.
    const lateEvening = new Date(2026, 6, 27, 23, 30, 0);
    expect(localIsoDate(lateEvening)).toBe("2026-07-27");
  });

  it("differs from the UTC derivation whenever the two days differ", () => {
    // The exact hour the Close moment's own heuristic starts showing (>= 17
    // local). This is the assertion that would have caught the shipped bug:
    // `toISOString().slice(0, 10)` is a DIFFERENT day here for every negative
    // UTC offset, which is the entire Americas.
    const closeHour = new Date(2026, 6, 27, 17, 0, 0);
    const utcDay = closeHour.toISOString().slice(0, 10);
    const localDay = localIsoDate(closeHour);

    expect(localDay).toBe("2026-07-27");
    if (utcDay !== localDay) {
      // Running in a timezone where the two genuinely disagree: the local
      // derivation is the one that matches the day the user is living in.
      expect(closeHour.getDate()).toBe(27);
    }
  });

  it("pads single-digit months and days", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("rolls to the next day at local midnight, not at 00:00Z", () => {
    expect(localIsoDate(new Date(2026, 6, 28, 0, 0, 0))).toBe("2026-07-28");
    expect(localIsoDate(new Date(2026, 6, 27, 23, 59, 59))).toBe("2026-07-27");
  });
});

describe("resolveDayClose", () => {
  const day = "2026-07-27";

  it("is null when the day is genuinely still open", () => {
    expect(resolveDayClose([], [], day)).toBeNull();
    expect(resolveDayClose(["2026-07-26"], ["2026-07-25"], day)).toBeNull();
  });

  it("reports an account close as saved to the account", () => {
    expect(resolveDayClose([day], [], day)).toEqual({
      periodStart: day,
      savedToAccount: true,
    });
  });

  it("reports a journalled-only close as NOT in the account", () => {
    // The honest half: the close is real and durable on this device, and the
    // account does not have it. The Close moment renders the device sentence
    // for exactly this case rather than claiming a save.
    expect(resolveDayClose([], [day], day)).toEqual({
      periodStart: day,
      savedToAccount: false,
    });
  });

  it("lets the account win when both tiers hold the same day", () => {
    // Reachable in the window between the account taking the write and the
    // journal read being refreshed. Claiming the weaker of two true states
    // would understate where the user's work is.
    expect(resolveDayClose([day], [day], day)).toEqual({
      periodStart: day,
      savedToAccount: true,
    });
  });
});

describe("isDailyCloseConflict", () => {
  it("recognises the daily-close index by name", () => {
    expect(
      isDailyCloseConflict(
        new Error(
          `duplicate key value violates unique constraint "${DAILY_CLOSE_INDEX}"`,
        ),
      ),
    ).toBe(true);
  });

  it("does NOT swallow a client_write_id violation", () => {
    // A different key, meaning a different thing. Treating it as terminal
    // success would silently drop a write that has not landed.
    expect(
      isDailyCloseConflict(
        new Error(
          'duplicate key value violates unique constraint "review_entries_user_client_write_id_key"',
        ),
      ),
    ).toBe(false);
  });

  it("does not treat unrelated failures as an already-closed day", () => {
    expect(isDailyCloseConflict(new Error("Failed to fetch"))).toBe(false);
    expect(isDailyCloseConflict(null)).toBe(false);
    expect(isDailyCloseConflict(undefined)).toBe(false);
    expect(isDailyCloseConflict({})).toBe(false);
  });

  it("reads a bare PostgrestError object, not only an Error", () => {
    expect(
      isDailyCloseConflict({
        code: "23505",
        message: `duplicate key value violates unique constraint "${DAILY_CLOSE_INDEX}"`,
      }),
    ).toBe(true);
  });
});
