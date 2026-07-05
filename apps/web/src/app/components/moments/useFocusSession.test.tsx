import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { WorkflowProvider } from "@/lib/WorkflowContext";
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
    vi.useRealTimers();
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
});
