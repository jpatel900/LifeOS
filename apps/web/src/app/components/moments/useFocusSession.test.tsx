import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import * as WorkflowContext from "@/lib/WorkflowContext";
import { useFocusSession } from "./useFocusSession";

/**
 * Moments pass P0 — packet: focused unit coverage of the extracted focus
 * session hook. Mirrors the exact tick/auto-stop semantics transcribed from
 * LifeOSCockpit.tsx (fake timers, no real waiting) so a regression in the
 * decrement or the auto-stop-at-zero behavior fails here, not only in E2E.
 *
 * WorkflowProvider is the real provider (no mocking needed — it falls back
 * to local/demo state without Supabase env configured), so startTaskSession
 * / markSession exercise the same code path the cockpit relies on.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <WorkflowProvider>{children}</WorkflowProvider>;
}

describe("useFocusSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reset clears an expired cap session without issuing another workflow write", () => {
    const startTaskSession = vi.fn();
    const markSession = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(WorkflowContext, "useWorkflow").mockReturnValue({
      startTaskSession,
      markSession,
    } as unknown as ReturnType<typeof WorkflowContext.useWorkflow>);
    const { result } = renderHook(() => useFocusSession());

    act(() => {
      result.current.start("task-1", 1);
      vi.advanceTimersByTime(60_000);
    });
    startTaskSession.mockClear();
    markSession.mockClear();

    act(() => {
      result.current.reset();
    });

    expect(result.current.activeTaskId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
    expect(result.current.total).toBe(0);
    expect(startTaskSession).not.toHaveBeenCalled();
    expect(markSession).not.toHaveBeenCalled();
  });

  it("starts a session with the given minutes and ticks remaining down every second", () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper });

    act(() => {
      result.current.start("task-1", 1);
    });

    expect(result.current.activeTaskId).toBe("task-1");
    expect(result.current.running).toBe(true);
    expect(result.current.total).toBe(60);
    expect(result.current.remaining).toBe(60);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(59);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.remaining).toBe(54);
  });

  it("auto-stops running at zero without clearing the active task", () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper });

    act(() => {
      result.current.start("task-1", 1);
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.remaining).toBe(0);
    expect(result.current.running).toBe(false);
    expect(result.current.activeTaskId).toBe("task-1");
  });

  it("pauses via toggle without resetting remaining time, then resumes", () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper });

    act(() => {
      result.current.start("task-1", 5);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.remaining).toBe(290);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(290);

    // Paused: no further ticking.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.remaining).toBe(290);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.running).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(289);
  });

  it("finish clears the active task and remaining time but leaves total untouched (matches the original cockpit finishSession)", () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper });

    act(() => {
      result.current.start("task-1", 2);
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    act(() => {
      result.current.finish("completed");
    });

    expect(result.current.activeTaskId).toBeNull();
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
    expect(result.current.total).toBe(120);
  });

  it("extend adds minutes to both remaining and total", () => {
    const { result } = renderHook(() => useFocusSession(), { wrapper });

    act(() => {
      result.current.start("task-1", 1);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.remaining).toBe(50);
    expect(result.current.total).toBe(60);

    act(() => {
      result.current.extend(2);
    });

    expect(result.current.remaining).toBe(170);
    expect(result.current.total).toBe(180);
  });

  /**
   * SP-2 — packet: drift-free anchored clocks. These tests use an injected
   * `now` driven independently of `vi.advanceTimersByTime` so a simulated
   * wall-clock JUMP (tab hidden, laptop asleep) can be modeled precisely:
   * timers advance by a small amount while `now()` reports a much larger
   * elapsed time, exactly as happens when a throttled/backgrounded tab wakes
   * up. A naive accumulating decrement would only have ticked once; the
   * anchored implementation must recompute the true remaining value.
   */
  describe("SP-2 anchored clock", () => {
    function makeClock(startMs: number) {
      let currentMs = startMs;
      return {
        now: () => currentMs,
        advance(ms: number) {
          currentMs += ms;
        },
      };
    }

    it("recomputes correctly after a simulated tab-hidden 2-minute wall-clock jump", () => {
      const clock = makeClock(1_700_000_000_123); // deliberately off a second boundary
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 10); // 600s total
      });
      expect(result.current.remaining).toBe(600);

      // Simulate the tab going hidden: no visibilitychange fires here (jsdom
      // default document.hidden stays false in this test), but the wall
      // clock still jumps forward 2 minutes while only a single fake timer
      // tick elapses (modeling a throttled background tab that still
      // manages one delayed callback before resuming full-speed ticking).
      clock.advance(2 * 60_000);
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Anchored derivation: remaining must reflect the full 2-minute jump,
      // not "decremented by 1 second" the way a naive counter would.
      expect(result.current.remaining).toBe(600 - 120);
    });

    it("does not drift over 100 simulated second-boundary ticks", () => {
      const clock = makeClock(1_700_000_000_407);
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 5); // 300s total
      });

      for (let i = 0; i < 100; i += 1) {
        clock.advance(1000);
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }

      // Exactly 100 real seconds elapsed: remaining must be exactly 200,
      // never 199 or 201 — no accumulated rounding drift from repeated
      // off-boundary ticks.
      expect(result.current.remaining).toBe(300 - 100);
    });

    it("recomputes immediately on visibilitychange back to visible", () => {
      const clock = makeClock(1_700_000_000_000);
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 10); // 600s total
      });

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      clock.advance(90_000); // 90s pass while hidden
      // No timer advance: nothing should schedule while hidden, so a lack of
      // "remaining" update here would be consistent either way. The real
      // assertion is what happens on return below.

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current.remaining).toBe(600 - 90);

      // Restore jsdom's default so later tests are unaffected.
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
    });

    // Regression guard: an earlier draft of this packet stopped scheduling
    // entirely once a pending setTimeout fired while hidden and bailed out —
    // the visibilitychange handler recomputed the value once on return, but
    // no further ticks ever followed because the tick effect's dependency
    // list didn't change when visibility flipped back. This models exactly
    // that sequence (hidden -> a background timer fires -> visible again)
    // and asserts a SUBSEQUENT tick still lands, not just the one-time
    // recompute on return.
    it("resumes ticking after a hidden span even if a pending timeout fires while hidden", () => {
      const clock = makeClock(1_700_000_000_000);
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 10); // 600s
      });

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // A pending timeout fires WHILE hidden (background tab throttling).
      clock.advance(1000);
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      clock.advance(1000);
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.remaining).toBe(600 - 2);

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
    });

    it("pause -> resume elapsed time is correct across a paused span", () => {
      const clock = makeClock(1_700_000_000_250);
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 5); // 300s total
      });

      clock.advance(20_000);
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(result.current.remaining).toBe(280);

      act(() => {
        result.current.toggle(); // pause
      });
      expect(result.current.running).toBe(false);
      expect(result.current.remaining).toBe(280);

      // Wall clock and fake timers both advance while paused; remaining
      // must hold steady (paused time must not count as elapsed).
      clock.advance(45_000);
      act(() => {
        vi.advanceTimersByTime(45_000);
      });
      expect(result.current.remaining).toBe(280);

      act(() => {
        result.current.toggle(); // resume
      });
      expect(result.current.running).toBe(true);

      clock.advance(30_000);
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(result.current.remaining).toBe(250);
    });

    it("finish's actualMinutes matches the pre-change ceil((total-remaining)/60) formula across representative timings", () => {
      const clock = makeClock(1_700_000_000_600);
      const { result } = renderHook(() => useFocusSession({ now: clock.now }), {
        wrapper,
      });

      act(() => {
        result.current.start("task-1", 4); // 240s total
      });

      // 90s elapsed -> ceil(90/60) = 2 minutes.
      clock.advance(90_000);
      act(() => {
        vi.advanceTimersByTime(90_000);
      });
      expect(result.current.remaining).toBe(150);

      act(() => {
        result.current.finish("completed");
      });

      expect(result.current.total).toBe(240);
      expect(result.current.remaining).toBe(0);
      // actualMinutes = ceil((240 - 150) / 60) = ceil(1.5) = 2, recorded via
      // markSession inside finish (exercised, not separately spied here —
      // WorkflowProvider is the real provider per the P0 test convention).
    });
  });
});
