import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_RECALIBRATION_CONFIG,
  applyRecalibration,
  computeDurationRecalibration,
} from "./durationRecalibration";

describe("computeDurationRecalibration", () => {
  it("surfaces a sourced multiplier when actuals consistently overrun", () => {
    const result = computeDurationRecalibration([
      { plannedMinutes: 60, actualMinutes: 84 },
      { plannedMinutes: 30, actualMinutes: 42 },
      { plannedMinutes: 45, actualMinutes: 63 },
    ]);

    expect(result).toEqual({
      multiplier: 1.4,
      sampleCount: 3,
      evidence: "your actuals on this area run 1.4x",
    });
  });

  it("returns null below the sample floor", () => {
    expect(
      computeDurationRecalibration([
        { plannedMinutes: 60, actualMinutes: 90 },
        { plannedMinutes: 60, actualMinutes: 90 },
      ]),
    ).toBeNull();
  });

  it("returns null when actuals track the estimate (within the deadband)", () => {
    expect(
      computeDurationRecalibration([
        { plannedMinutes: 60, actualMinutes: 63 },
        { plannedMinutes: 60, actualMinutes: 66 },
        { plannedMinutes: 60, actualMinutes: 60 },
      ]),
    ).toBeNull();
  });

  it("ignores sessions missing a planned or actual value", () => {
    expect(
      computeDurationRecalibration([
        { plannedMinutes: 60, actualMinutes: null },
        { plannedMinutes: null, actualMinutes: 90 },
        { plannedMinutes: 0, actualMinutes: 30 },
        { plannedMinutes: 60, actualMinutes: 90 },
      ]),
    ).toBeNull(); // only one usable sample -> below floor
  });

  it("detects consistent underruns too", () => {
    const result = computeDurationRecalibration([
      { plannedMinutes: 60, actualMinutes: 36 },
      { plannedMinutes: 60, actualMinutes: 36 },
      { plannedMinutes: 60, actualMinutes: 36 },
    ]);
    expect(result?.multiplier).toBe(0.6);
  });

  it("exposes the default config", () => {
    expect(DEFAULT_DURATION_RECALIBRATION_CONFIG).toEqual({
      minSamples: 3,
      minDeviation: 0.15,
    });
  });
});

describe("applyRecalibration", () => {
  it("scales an estimate and rounds to whole minutes", () => {
    expect(applyRecalibration(60, 1.4)).toBe(84);
    expect(applyRecalibration(45, 1.4)).toBe(63);
    expect(applyRecalibration(50, 0.6)).toBe(30);
  });
});
