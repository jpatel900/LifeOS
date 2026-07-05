import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COUNTDOWN_WARN_THRESHOLD_MINUTES,
  formatRemaining,
  formatUntil,
  useCountdown,
} from "./useCountdown";

describe("formatRemaining", () => {
  it("clamps non-positive durations to the floor label", () => {
    expect(formatRemaining(0)).toBe("0m left");
    expect(formatRemaining(-1)).toBe("0m left");
    expect(formatRemaining(-60_000)).toBe("0m left");
  });

  it("formats seconds only under a minute", () => {
    expect(formatRemaining(45_000)).toBe("45s left");
    expect(formatRemaining(1_000)).toBe("1s left");
  });

  it("formats minutes only under an hour", () => {
    expect(formatRemaining(12 * 60_000)).toBe("12m left");
    expect(formatRemaining(59 * 60_000 + 59_000)).toBe("59m left");
  });

  it("formats hours and minutes at/over an hour", () => {
    expect(formatRemaining(2 * 3_600_000 + 58 * 60_000)).toBe("2h 58m left");
    expect(formatRemaining(3_600_000)).toBe("1h 0m left");
  });

  it("is exact at the minute/hour boundaries", () => {
    expect(formatRemaining(60_000)).toBe("1m left");
    expect(formatRemaining(59_999)).toBe("59s left");
  });
});

describe("formatUntil", () => {
  it("clamps non-positive durations", () => {
    expect(formatUntil(0)).toBe("in 0m");
    expect(formatUntil(-5)).toBe("in 0m");
  });

  it("formats seconds/minutes/hours precedence", () => {
    expect(formatUntil(45_000)).toBe("in 45s");
    expect(formatUntil(12 * 60_000)).toBe("in 12m");
    expect(formatUntil(3 * 3_600_000 + 28 * 60_000)).toBe("in 3h 28m");
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zeroed, non-ticking result for a null endAt", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current).toEqual({
      remainingMs: 0,
      label: "",
      warn: false,
    });
  });

  it("ticks down every interval and reflects the injected clock", () => {
    let nowMs = new Date("2026-07-05T12:00:00.000Z").getTime();
    const endAt = new Date(nowMs + 5 * 60_000).toISOString(); // 5 minutes out

    const { result } = renderHook(() =>
      useCountdown(endAt, { now: () => nowMs, intervalMs: 1000 }),
    );

    expect(result.current.remainingMs).toBe(5 * 60_000);
    expect(result.current.label).toBe("5m left");
    // 5 minutes > 10-minute warn threshold's complement check: still under threshold since 5 <= 10.
    expect(result.current.warn).toBe(true);

    nowMs += 60_000; // advance 1 minute
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.remainingMs).toBe(4 * 60_000);
    expect(result.current.label).toBe("4m left");
  });

  it("transitions warn from false to true as remaining crosses the threshold", () => {
    let nowMs = new Date("2026-07-05T12:00:00.000Z").getTime();
    const endAt = new Date(
      nowMs + (COUNTDOWN_WARN_THRESHOLD_MINUTES + 1) * 60_000,
    ).toISOString();

    const { result } = renderHook(() =>
      useCountdown(endAt, { now: () => nowMs, intervalMs: 1000 }),
    );

    expect(result.current.warn).toBe(false);

    nowMs += 60_000; // now exactly at the threshold
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.remainingMs).toBe(
      COUNTDOWN_WARN_THRESHOLD_MINUTES * 60_000,
    );
    expect(result.current.warn).toBe(true);
  });

  it("clears its interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const endAt = new Date(Date.now() + 60_000).toISOString();

    const { unmount } = renderHook(() => useCountdown(endAt));
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
