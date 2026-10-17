import { describe, expect, it } from "vitest";
import { buildParseCaptureMessages } from "./contextAssembly";
import { buildParseCaptureClock } from "./parseCaptureClock";

/**
 * Bug hunt #16 — the parse prompt never said what day it is or the user's
 * time zone, yet a decision's deadline ("by end of day Friday") is kept on
 * accept. The model must be told the user's local date and offset.
 */
describe("parse prompt carries the user's date and time zone (bug hunt #16)", () => {
  const clock = {
    today: "2026-10-17",
    weekday: "Saturday",
    timeZone: "Australia/Sydney",
    utcOffset: "+11:00",
  };

  it("adds the user's date and offset to the trusted context", () => {
    const messages = buildParseCaptureMessages({
      rawText: "Decide whether to renew the lease by end of day Friday",
      clock,
    });
    const trusted = messages.filter((m) => m.role === "user");
    expect(trusted.length).toBe(2);
    expect(trusted[0]!.content).toContain("Saturday 2026-10-17");
    expect(trusted[0]!.content).toContain("Australia/Sydney");
    expect(trusted[0]!.content).toContain("+11:00");
    // The raw capture stays alone in the final message (INV-8).
    expect(trusted[1]!.content).toContain("Raw capture:");
    expect(trusted[1]!.content).not.toContain("2026-10-17");
  });

  it("leaves the prompt unchanged when no clock is given", () => {
    const withUndefined = buildParseCaptureMessages({ rawText: "Buy milk" });
    const withNull = buildParseCaptureMessages({
      rawText: "Buy milk",
      clock: null,
    });
    expect(withNull).toEqual(withUndefined);
  });

  it("builds the clock from a local time", () => {
    const built = buildParseCaptureClock(new Date(2026, 9, 17, 9, 30));
    expect(built.today).toBe("2026-10-17");
    expect(built.weekday).toBe("Saturday");
    expect(built.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(built.timeZone.length).toBeGreaterThan(0);
  });
});
