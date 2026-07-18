import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO,
  DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT,
  DEFAULT_DISMISSAL_SPIKE_WINDOW_MS,
  deriveDaysSinceMeaningfulActivity,
  deriveDismissalSpike,
} from "./ruptureSignals";

const DAY_MS = 86_400_000;
const REFERENCE = "2026-07-17T00:00:00.000Z";
const referenceMs = Date.parse(REFERENCE);

function minusMs(ms: number): string {
  return new Date(referenceMs - ms).toISOString();
}

function hijackedIteratorArray(values: readonly string[]): unknown {
  const arr = [...values] as unknown as {
    [Symbol.iterator]: () => Iterator<string>;
  } & string[];
  arr[Symbol.iterator] = () => {
    throw new Error("hijacked iterator must never be used");
  };
  return arr;
}

describe("deriveDaysSinceMeaningfulActivity", () => {
  it("returns 0 for empty input", () => {
    expect(deriveDaysSinceMeaningfulActivity(REFERENCE, [])).toBe(0);
  });

  it("returns 0 when every timestamp is malformed", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        "not-a-date",
        "",
        "2026-13-99",
      ]),
    ).toBe(0);
  });

  it("returns 0 when every timestamp is strictly after referenceDate", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        minusMs(-DAY_MS),
        minusMs(-1),
      ]),
    ).toBe(0);
  });

  it("is deliberately 0, not Infinity or NaN, on no usable data", () => {
    const result = deriveDaysSinceMeaningfulActivity(REFERENCE, []);
    expect(result).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("computes exact boundary: 7 * 86_400_000 ms elapsed returns 7 (triggers >= 7)", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [minusMs(7 * DAY_MS)]),
    ).toBe(7);
  });

  it("one ms under the boundary returns 6 (does not trigger >= 7)", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [minusMs(7 * DAY_MS - 1)]),
    ).toBe(6);
  });

  it("one ms over the boundary still returns 7 via floor", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [minusMs(7 * DAY_MS + 1)]),
    ).toBe(7);
  });

  it("selects the latest valid, non-future timestamp as the candidate", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        minusMs(10 * DAY_MS),
        minusMs(2 * DAY_MS),
        minusMs(20 * DAY_MS),
      ]),
    ).toBe(2);
  });

  it("excludes malformed entries from the max computation, keeping valid ones", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        "garbage",
        minusMs(3 * DAY_MS),
        null as unknown as string,
      ]),
    ).toBe(3);
  });

  it("excludes future-noise entries but keeps the latest valid non-future one", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        minusMs(4 * DAY_MS),
        minusMs(-DAY_MS),
      ]),
    ).toBe(4);
  });

  it("treats an exact-referenceDate timestamp as valid (0 days elapsed)", () => {
    expect(deriveDaysSinceMeaningfulActivity(REFERENCE, [REFERENCE])).toBe(0);
  });

  it("is deterministic across repeated calls with identical input", () => {
    const timestamps = [minusMs(5 * DAY_MS), minusMs(1 * DAY_MS)];
    const first = deriveDaysSinceMeaningfulActivity(REFERENCE, timestamps);
    const second = deriveDaysSinceMeaningfulActivity(REFERENCE, timestamps);
    expect(first).toBe(second);
  });

  it("is timezone-explicit: instants that differ only under local-TZ calendar-day conversion still floor correctly", () => {
    // 23:00 UTC on day N and 01:00 UTC two days later than that is a mix that
    // would produce different calendar-day deltas under local-time conversion
    // in many timezones, but elapsed-ms floor math must be TZ-invariant.
    const ref = "2026-07-17T23:00:00.000Z";
    const activity = "2026-07-10T01:00:00.000Z";
    const elapsedMs = Date.parse(ref) - Date.parse(activity);
    const expectedDays = Math.floor(elapsedMs / DAY_MS);
    expect(deriveDaysSinceMeaningfulActivity(ref, [activity])).toBe(
      expectedDays,
    );
  });

  it.each([
    null,
    undefined,
    42,
    {},
    "not-an-array",
    hijackedIteratorArray([minusMs(DAY_MS)]),
  ])("never throws on hostile activityTimestamps input %#", (hostile) => {
    expect(() =>
      deriveDaysSinceMeaningfulActivity(
        REFERENCE,
        hostile as unknown as readonly string[],
      ),
    ).not.toThrow();
  });

  it("treats non-array hostile input as empty (returns 0)", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(
        REFERENCE,
        null as unknown as readonly string[],
      ),
    ).toBe(0);
    expect(
      deriveDaysSinceMeaningfulActivity(
        REFERENCE,
        {} as unknown as readonly string[],
      ),
    ).toBe(0);
  });

  it("treats non-string elements inside the array as malformed, not thrown", () => {
    expect(
      deriveDaysSinceMeaningfulActivity(REFERENCE, [
        123 as unknown as string,
        minusMs(6 * DAY_MS),
        {} as unknown as string,
        undefined as unknown as string,
      ]),
    ).toBe(6);
  });

  it("never reads a hostile iterator on an array-like hijacked object", () => {
    expect(() =>
      deriveDaysSinceMeaningfulActivity(
        REFERENCE,
        hijackedIteratorArray([minusMs(2 * DAY_MS)]) as readonly string[],
      ),
    ).not.toThrow();
    expect(
      deriveDaysSinceMeaningfulActivity(
        REFERENCE,
        hijackedIteratorArray([minusMs(2 * DAY_MS)]) as readonly string[],
      ),
    ).toBe(2);
  });

  it("treats a malformed referenceDate as producing 0 (no valid reference instant)", () => {
    expect(
      deriveDaysSinceMeaningfulActivity("not-a-date", [minusMs(DAY_MS)]),
    ).toBe(0);
  });
});

describe("deriveDismissalSpike constants", () => {
  it("exposes frozen, named tunable defaults", () => {
    expect(Object.isFrozen).toBeDefined();
    expect(typeof DEFAULT_DISMISSAL_SPIKE_WINDOW_MS).toBe("number");
    expect(typeof DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT).toBe("number");
    expect(typeof DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO).toBe("number");
  });
});

describe("deriveDismissalSpike", () => {
  it("returns false for empty dismissalTimestamps", () => {
    expect(deriveDismissalSpike(REFERENCE, [])).toBe(false);
  });

  it("returns false below the threshold count", () => {
    const timestamps = Array.from(
      { length: DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT - 1 },
      (_unused, i) => minusMs(i * 1000),
    );
    expect(deriveDismissalSpike(REFERENCE, timestamps)).toBe(false);
  });

  it("returns true at exactly the threshold count", () => {
    const timestamps = Array.from(
      { length: DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT },
      (_unused, i) => minusMs(i * 1000),
    );
    expect(deriveDismissalSpike(REFERENCE, timestamps)).toBe(true);
  });

  it("excludes entries outside the window (not counted, not malformed)", () => {
    const timestamps = Array.from(
      { length: DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT },
      (_unused, i) => minusMs(i * 1000),
    );
    timestamps.push(minusMs(DEFAULT_DISMISSAL_SPIKE_WINDOW_MS + DAY_MS));
    // the out-of-window entry is well-formed but not in-window; still spikes
    // on the in-window count alone, and does not count toward malformed ratio.
    expect(deriveDismissalSpike(REFERENCE, timestamps)).toBe(true);
  });

  it("counts the window as closed (inclusive) at both edges", () => {
    const timestamps = Array.from(
      { length: DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT - 1 },
      (_unused, i) => minusMs(i * 1000),
    );
    timestamps.push(minusMs(DEFAULT_DISMISSAL_SPIKE_WINDOW_MS));
    timestamps.push(REFERENCE);
    expect(deriveDismissalSpike(REFERENCE, timestamps)).toBe(true);
  });

  it("returns false when malformed ratio exceeds the max even if raw in-window count meets threshold", () => {
    const validCount = DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT + 2;
    const valid = Array.from({ length: validCount }, (_unused, i) =>
      minusMs(i * 1000),
    );
    // Push enough malformed entries that malformedCount / total > max ratio.
    const malformedNeeded =
      Math.ceil(
        (DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO * validCount) /
          (1 - DEFAULT_DISMISSAL_SPIKE_MAX_MALFORMED_RATIO),
      ) + 1;
    const malformed = Array.from({ length: malformedNeeded }, () => "bad");
    expect(deriveDismissalSpike(REFERENCE, [...valid, ...malformed])).toBe(
      false,
    );
  });

  it("never counts malformed entries toward the in-window valid count", () => {
    const timestamps = ["not-a-date", "", minusMs(1000), minusMs(2000)];
    // only 2 valid entries — below default threshold (>=3) unless threshold is 2 or less
    const result = deriveDismissalSpike(REFERENCE, timestamps, {
      thresholdCount: 2,
      maxMalformedRatio: 0.9,
    });
    expect(result).toBe(true);
  });

  it("supports options overrides for window, threshold, and malformed ratio", () => {
    const timestamps = [minusMs(1000), minusMs(2000)];
    expect(
      deriveDismissalSpike(REFERENCE, timestamps, { thresholdCount: 2 }),
    ).toBe(true);
    expect(
      deriveDismissalSpike(REFERENCE, timestamps, { thresholdCount: 3 }),
    ).toBe(false);
  });

  it.each([
    { thresholdCount: -1 },
    { thresholdCount: Number.NaN },
    { thresholdCount: "3" as unknown as number },
    { windowMs: -1 },
    { windowMs: Number.NaN },
    { maxMalformedRatio: -0.5 },
    { maxMalformedRatio: Number.NaN },
    { maxMalformedRatio: "0.5" as unknown as number },
  ])(
    "falls back to the safe default rather than throwing or using garbage option %j",
    (badOptions) => {
      expect(() =>
        deriveDismissalSpike(REFERENCE, [], badOptions),
      ).not.toThrow();
      // With defaults restored, threshold-count worth of in-window valid
      // dismissals should still trigger true (proves the garbage override
      // did not silently disable or loosen the guard to "never trigger").
      const timestamps = Array.from(
        { length: DEFAULT_DISMISSAL_SPIKE_THRESHOLD_COUNT },
        (_unused, i) => minusMs(i * 1000),
      );
      expect(deriveDismissalSpike(REFERENCE, timestamps, badOptions)).toBe(
        true,
      );
    },
  );

  it("is deterministic across repeated calls with identical input", () => {
    const timestamps = [minusMs(1000), minusMs(2000), minusMs(3000)];
    const first = deriveDismissalSpike(REFERENCE, timestamps);
    const second = deriveDismissalSpike(REFERENCE, timestamps);
    expect(first).toBe(second);
  });

  it.each([
    null,
    undefined,
    42,
    {},
    "not-an-array",
    hijackedIteratorArray([minusMs(1000)]),
  ])("never throws on hostile dismissalTimestamps input %#", (hostile) => {
    expect(() =>
      deriveDismissalSpike(REFERENCE, hostile as unknown as readonly string[]),
    ).not.toThrow();
  });

  it("treats non-array hostile dismissalTimestamps input as empty (returns false)", () => {
    expect(
      deriveDismissalSpike(REFERENCE, null as unknown as readonly string[]),
    ).toBe(false);
  });

  it("never throws on a hostile options object with getters that throw", () => {
    const hostileOptions = {
      get thresholdCount(): number {
        throw new Error("hostile getter");
      },
    };
    expect(() =>
      deriveDismissalSpike(
        REFERENCE,
        [minusMs(1000)],
        hostileOptions as unknown as Parameters<typeof deriveDismissalSpike>[2],
      ),
    ).not.toThrow();
  });

  it("treats a malformed referenceDate as no data (returns false, no throw)", () => {
    expect(deriveDismissalSpike("not-a-date", [minusMs(1000)])).toBe(false);
  });
});
