import { describe, expect, it } from "vitest";

import {
  MIRROR_MIN_TREND_SAMPLE_COUNT,
  MIRROR_TREND_FLAT_BAND,
  computeMirrorTrend,
  type MirrorPurposeSample,
} from "./mirrorTrendKernel";

const sample = (
  response: string,
  sampledAtMs: number,
  overrides: Record<string, unknown> = {},
): MirrorPurposeSample =>
  ({
    response,
    sampledAtMs,
    sanctuaryContext: {},
    ...overrides,
  }) as MirrorPurposeSample;

describe("constants", () => {
  it("min sample count is the frozen ratified default of 3 (OWNER-GATE on #668)", () => {
    expect(MIRROR_MIN_TREND_SAMPLE_COUNT).toBe(3);
  });

  it("flat band is a positive finite constant", () => {
    expect(MIRROR_TREND_FLAT_BAND).toBeGreaterThan(0);
    expect(Number.isFinite(MIRROR_TREND_FLAT_BAND)).toBe(true);
  });
});

describe("computeMirrorTrend — insufficient data (fail closed)", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 7],
    ["a string", "samples"],
    ["a plain object", {}],
    ["an empty array", []],
  ])("returns insufficient_data for %s", (_label, input) => {
    expect(computeMirrorTrend(input)).toEqual({
      status: "insufficient_data",
      sampleCount: 0,
    });
  });

  it("returns insufficient_data below the minimum sample count", () => {
    const result = computeMirrorTrend([
      sample("even", 1),
      sample("lighter", 2),
    ]);
    expect(result).toEqual({ status: "insufficient_data", sampleCount: 2 });
  });

  it("never throws and fails closed when the container is a hostile proxy", () => {
    const hostile = new Proxy([], {
      get() {
        throw new Error("trap");
      },
      getOwnPropertyDescriptor() {
        throw new Error("trap");
      },
    });
    expect(computeMirrorTrend(hostile)).toEqual({
      status: "insufficient_data",
      sampleCount: 0,
    });
  });
});

describe("computeMirrorTrend — hostile / malformed records are dropped, never counted", () => {
  it("drops records with accessor fields without invoking the getter", () => {
    let invoked = false;
    const trap: Record<string, unknown> = { sanctuaryContext: {} };
    Object.defineProperty(trap, "response", {
      get() {
        invoked = true;
        return "lighter";
      },
      enumerable: true,
    });
    Object.defineProperty(trap, "sampledAtMs", {
      value: 5,
      enumerable: true,
    });

    const result = computeMirrorTrend([
      trap,
      sample("even", 1),
      sample("even", 2),
    ]);
    expect(invoked).toBe(false);
    expect(result).toEqual({ status: "insufficient_data", sampleCount: 2 });
  });

  it.each([
    ["null record", null],
    ["non-object record", 9],
    ["class-instance record", new (class {})()],
    ["unknown response", sample("great", 1)],
    ["case-drifted response", sample("Lighter", 1)],
    ["non-finite time", sample("even", Number.NaN)],
    ["missing sanctuary context", { response: "even", sampledAtMs: 1 }],
  ])("drops %s", (_label, bad) => {
    const result = computeMirrorTrend([bad, sample("even", 1)]);
    expect(result).toEqual({ status: "insufficient_data", sampleCount: 1 });
  });

  it("excludes sanctuary-marked samples via the shared predicate", () => {
    const result = computeMirrorTrend([
      sample("lighter", 1, { sanctuaryContext: { day: true } }),
      sample("even", 2),
      sample("even", 3),
    ]);
    expect(result).toEqual({ status: "insufficient_data", sampleCount: 2 });
  });
});

describe("computeMirrorTrend — trend directions (caller-supplied time only)", () => {
  it("reports up when recent samples sit lighter than earlier ones", () => {
    const result = computeMirrorTrend([
      sample("heavier", 10),
      sample("even", 20),
      sample("lighter", 30),
    ]);
    expect(result.status).toBe("up");
    expect(result.sampleCount).toBe(3);
    if (result.status !== "insufficient_data") {
      expect(result.points).toEqual([-1, 0, 1]);
    }
  });

  it("reports down when recent samples sit heavier", () => {
    const result = computeMirrorTrend([
      sample("lighter", 10),
      sample("even", 20),
      sample("heavier", 30),
    ]);
    expect(result.status).toBe("down");
  });

  it("reports flat when nothing moves", () => {
    const result = computeMirrorTrend([
      sample("even", 10),
      sample("even", 20),
      sample("even", 30),
    ]);
    expect(result.status).toBe("flat");
  });

  it("orders by caller-supplied time, not array order", () => {
    const result = computeMirrorTrend([
      sample("lighter", 30),
      sample("heavier", 10),
      sample("even", 20),
    ]);
    expect(result.status).toBe("up");
    if (result.status !== "insufficient_data") {
      expect(result.points).toEqual([-1, 0, 1]);
    }
  });

  it("is deterministic — identical input yields identical output", () => {
    const input = [
      sample("even", 10),
      sample("lighter", 20),
      sample("lighter", 30),
      sample("heavier", 5),
    ];
    expect(computeMirrorTrend(input)).toEqual(computeMirrorTrend(input));
  });

  it("never interpolates: sampleCount equals valid samples only", () => {
    const result = computeMirrorTrend([
      sample("even", 10),
      sample("even", 20),
      sample("even", 30),
      null,
      sample("bogus", 40),
    ]);
    expect(result.sampleCount).toBe(3);
  });
});
