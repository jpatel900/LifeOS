import { describe, expect, it } from "vitest";
import { formatClock, formatRelative, plural } from "./formatTime";

const NOW = new Date("2026-07-05T15:00:00.000Z");

describe("formatRelative", () => {
  it("reads 'just now' for anything inside the same minute", () => {
    expect(formatRelative(NOW.toISOString(), NOW)).toBe("just now");
    expect(
      formatRelative(new Date(NOW.getTime() + 59_000).toISOString(), NOW),
    ).toBe("just now");
    expect(
      formatRelative(new Date(NOW.getTime() - 59_000).toISOString(), NOW),
    ).toBe("just now");
  });

  it("is exact at the 59s -> 1m boundary", () => {
    expect(
      formatRelative(new Date(NOW.getTime() + 60_000).toISOString(), NOW),
    ).toBe("in 1m");
    expect(
      formatRelative(new Date(NOW.getTime() - 60_000).toISOString(), NOW),
    ).toBe("1m ago");
  });

  it("formats future minutes/hours precedence", () => {
    expect(
      formatRelative(new Date(NOW.getTime() + 12 * 60_000).toISOString(), NOW),
    ).toBe("in 12m");
    expect(
      formatRelative(
        new Date(NOW.getTime() + 3 * 3_600_000 + 28 * 60_000).toISOString(),
        NOW,
      ),
    ).toBe("in 3h 28m");
    expect(
      formatRelative(new Date(NOW.getTime() + 3_600_000).toISOString(), NOW),
    ).toBe("in 1h");
  });

  it("formats past minutes/hours/days precedence", () => {
    expect(
      formatRelative(new Date(NOW.getTime() - 12 * 60_000).toISOString(), NOW),
    ).toBe("12m ago");
    expect(
      formatRelative(
        new Date(NOW.getTime() - (3 * 3_600_000 + 28 * 60_000)).toISOString(),
        NOW,
      ),
    ).toBe("3h 28m ago");
    expect(
      formatRelative(
        new Date(NOW.getTime() - 8 * 24 * 3_600_000).toISOString(),
        NOW,
      ),
    ).toBe("8 days ago");
  });

  it("is exact at the hour/day boundaries", () => {
    expect(
      formatRelative(
        new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
        NOW,
      ),
    ).toBe("1 day ago");
    expect(
      formatRelative(
        new Date(NOW.getTime() - (24 * 3_600_000 - 1_000)).toISOString(),
        NOW,
      ),
    ).toBe("23h 59m ago");
  });

  it("singularizes 1 day / pluralizes 2+ days", () => {
    expect(
      formatRelative(
        new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
        NOW,
      ),
    ).toBe("in 1 day");
    expect(
      formatRelative(
        new Date(NOW.getTime() + 2 * 24 * 3_600_000).toISOString(),
        NOW,
      ),
    ).toBe("in 2 days");
  });
});

describe("formatClock", () => {
  it("matches the exact toLocaleTimeString options used by swept sites", () => {
    const iso = "2026-07-05T15:00:00.000Z";
    expect(formatClock(iso)).toBe(
      new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("is deterministic for the same input", () => {
    const iso = "2026-07-05T09:05:00.000Z";
    expect(formatClock(iso)).toBe(formatClock(iso));
  });
});

describe("plural", () => {
  it("uses the singular form at n=1", () => {
    expect(plural(1, "task")).toBe("1 task");
  });

  it("uses the default (singular + s) plural form at n=0 and n=2", () => {
    expect(plural(0, "task")).toBe("0 tasks");
    expect(plural(2, "task")).toBe("2 tasks");
  });

  it("uses an explicit irregular plural form when given", () => {
    expect(plural(1, "child", "children")).toBe("1 child");
    expect(plural(3, "child", "children")).toBe("3 children");
  });

  it("does not special-case negative counts (uses the plural form)", () => {
    expect(plural(-1, "task")).toBe("-1 tasks");
  });
});
