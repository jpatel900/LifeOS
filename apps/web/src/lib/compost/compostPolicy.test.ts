import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOST_THRESHOLD_DAYS,
  selectCompostTransitionIntents,
  type CompostCandidate,
} from "./compostPolicy";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const DAY_MS = 86_400_000;

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function candidate(
  overrides: Partial<CompostCandidate> = {},
): CompostCandidate {
  return {
    id: "capture-1",
    created_at: daysBefore(15),
    status: "new",
    excludedFromAutomation: false,
    ...overrides,
  };
}

describe("selectCompostTransitionIntents", () => {
  it("freezes the default threshold at 14 days and requires age to strictly exceed it", () => {
    expect(DEFAULT_COMPOST_THRESHOLD_DAYS).toBe(14);

    expect(
      selectCompostTransitionIntents(
        [
          candidate({ id: "older", created_at: daysBefore(14.000_001) }),
          candidate({ id: "exact", created_at: daysBefore(14) }),
          candidate({ id: "newer", created_at: daysBefore(13.999_999) }),
        ],
        { now: NOW },
      ),
    ).toEqual([{ captureId: "older", status: "composted" }]);
  });

  it("honors zero and fractional custom thresholds at their exact boundaries", () => {
    expect(
      selectCompostTransitionIntents(
        [
          candidate({
            id: "zero-old",
            created_at: new Date(NOW.getTime() - 1).toISOString(),
          }),
          candidate({ id: "zero-exact", created_at: NOW.toISOString() }),
        ],
        { now: NOW, thresholdDays: 0 },
      ),
    ).toEqual([{ captureId: "zero-old", status: "composted" }]);

    expect(
      selectCompostTransitionIntents(
        [
          candidate({ id: "fraction-old", created_at: daysBefore(1.500_001) }),
          candidate({ id: "fraction-exact", created_at: daysBefore(1.5) }),
        ],
        { now: NOW, thresholdDays: 1.5 },
      ),
    ).toEqual([{ captureId: "fraction-old", status: "composted" }]);
  });

  it("allows only new, parsed, and triage_required statuses", () => {
    const statuses = [
      "new",
      "parsed",
      "triage_required",
      "resolved",
      "archived",
      "composted",
      "unknown",
    ];

    expect(
      selectCompostTransitionIntents(
        statuses.map((status) => candidate({ id: status, status })),
        { now: NOW },
      ),
    ).toEqual([
      { captureId: "new", status: "composted" },
      { captureId: "parsed", status: "composted" },
      { captureId: "triage_required", status: "composted" },
    ]);
  });

  it("omits sanctuary-excluded candidates unless exclusion is exactly false", () => {
    expect(
      selectCompostTransitionIntents(
        [
          candidate({ id: "included" }),
          candidate({ id: "excluded", excludedFromAutomation: true }),
          {
            ...candidate({ id: "missing" }),
            excludedFromAutomation: undefined,
          } as unknown as CompostCandidate,
        ],
        { now: NOW },
      ),
    ).toEqual([{ captureId: "included", status: "composted" }]);
  });

  it("omits blank ids and malformed, non-finite, or future timestamps", () => {
    expect(
      selectCompostTransitionIntents(
        [
          candidate({ id: "" }),
          candidate({ id: "   " }),
          candidate({ id: "malformed", created_at: "not-a-date" }),
          candidate({
            id: "infinite",
            created_at: "275760-09-13T00:00:00.001Z",
          }),
          candidate({ id: "future", created_at: daysBefore(-1) }),
          candidate({ id: "valid" }),
        ],
        { now: NOW },
      ),
    ).toEqual([{ captureId: "valid", status: "composted" }]);
  });

  it.each([
    [new Date("invalid"), 14],
    [NOW, Number.NaN],
    [NOW, Number.POSITIVE_INFINITY],
    [NOW, -0.001],
  ])(
    "rejects invalid options before examining candidates",
    (now, thresholdDays) => {
      const candidates = new Proxy([] as CompostCandidate[], {
        get() {
          throw new Error("candidates were examined");
        },
      });

      expect(() =>
        selectCompostTransitionIntents(candidates, { now, thresholdDays }),
      ).toThrow();
    },
  );

  it("sorts oldest-first with raw id lexical ties and does not deduplicate", () => {
    expect(
      selectCompostTransitionIntents(
        [
          candidate({ id: "z", created_at: daysBefore(16) }),
          candidate({ id: "a", created_at: daysBefore(20) }),
          candidate({ id: "B", created_at: daysBefore(16) }),
          candidate({ id: "a", created_at: daysBefore(16) }),
        ],
        { now: NOW },
      ),
    ).toEqual([
      { captureId: "a", status: "composted" },
      { captureId: "B", status: "composted" },
      { captureId: "a", status: "composted" },
      { captureId: "z", status: "composted" },
    ]);
  });

  it("returns fresh exact-shape output without mutating input and repeats byte-identically", () => {
    const first = Object.freeze(
      candidate({ id: "first", created_at: daysBefore(20) }),
    );
    const second = Object.freeze(
      candidate({ id: "second", created_at: daysBefore(15) }),
    );
    const input = Object.freeze([second, first]);

    const result = selectCompostTransitionIntents(input, { now: NOW });
    const repeated = selectCompostTransitionIntents(input, { now: NOW });

    expect(input).toEqual([second, first]);
    expect(result).toEqual([
      { captureId: "first", status: "composted" },
      { captureId: "second", status: "composted" },
    ]);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      "captureId",
      "status",
    ]);
    expect(result).not.toBe(repeated);
    expect(result[0]).not.toBe(repeated[0]);
    expect(JSON.stringify(result)).toBe(JSON.stringify(repeated));
  });

  it("returns an empty new array for no candidates", () => {
    const first = selectCompostTransitionIntents([], { now: NOW });
    const second = selectCompostTransitionIntents([], { now: NOW });

    expect(first).toEqual([]);
    expect(first).not.toBe(second);
  });
});
