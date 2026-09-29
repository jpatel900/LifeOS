import { describe, expect, it } from "vitest";
import { localDayStamp } from "./localDay";
import { localIsoDate } from "../review/dayClose";
import { localDayStamp as purposeDayStamp } from "../purpose/purposeGaugeCheckin";

describe("localDayStamp", () => {
  it("pads the local calendar day and month", () => {
    expect(localDayStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("keeps the supplied local day on either side of midnight", () => {
    expect(localDayStamp(new Date(2026, 8, 29, 23, 59, 59, 999))).toBe(
      "2026-09-29",
    );
    expect(localDayStamp(new Date(2026, 8, 30, 0, 0, 0, 1))).toBe("2026-09-30");
  });

  it("keeps the review and purpose exports on the shared helper", () => {
    expect(localIsoDate).toBe(localDayStamp);
    expect(purposeDayStamp).toBe(localDayStamp);
  });
});
