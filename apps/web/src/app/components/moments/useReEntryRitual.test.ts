import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";
import { useReEntryRitual } from "./useReEntryRitual";

/**
 * FR-028 packet F-G2c: hook-level coverage over a hand-built WorkflowState
 * (same builder idiom as lib/reEntry/reEntry.test.ts), no WorkflowProvider —
 * this is the pure-state layer, not the integration layer (that lives in
 * TodayMoments.test.tsx).
 */

const NOW = new Date("2026-07-05T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeTask(
  overrides: Partial<Phase2MockTask> & { id: string; title: string },
): Phase2MockTask {
  return {
    user_id: "user-1",
    area_id: "area-1",
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: daysBefore(10),
    updated_at: daysBefore(10),
    ...overrides,
  } as Phase2MockTask;
}

function makeBlock(
  overrides: Partial<Phase2MockCalendarBlock> & { id: string },
): Phase2MockCalendarBlock {
  return {
    user_id: "user-1",
    area_id: "area-1",
    proposal_id: null,
    task_id: null,
    google_event_id: null,
    start_at: daysBefore(5),
    end_at: daysBefore(5),
    status: "scheduled",
    created_at: daysBefore(10),
    updated_at: daysBefore(10),
    ...overrides,
  } as Phase2MockCalendarBlock;
}

function stateWith(partial: Partial<WorkflowState>): WorkflowState {
  return { ...createInitialWorkflowState(), ...partial };
}

describe("useReEntryRitual", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("stays idle when there is no recorded activity (pristine state)", () => {
    const { result } = renderHook(() =>
      useReEntryRitual({ state: createInitialWorkflowState(), now: NOW }),
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.summary).toBeNull();
    expect(result.current.plan).toBeNull();
  });

  it("stays idle when the last activity is inside the threshold", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t1",
          title: "Recent task",
          created_at: daysBefore(1),
          updated_at: daysBefore(1),
        }),
      ],
    });

    const { result } = renderHook(() => useReEntryRitual({ state, now: NOW }));

    expect(result.current.status).toBe("idle");
  });

  it("goes ready in demo mode (no Supabase client) with empty outcomes", async () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Old task" })],
    });

    const { result } = renderHook(() => useReEntryRitual({ state, now: NOW }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.demoMode).toBe(true);
    expect(result.current.outcomes).toEqual([]);
    expect(result.current.summary).not.toBeNull();
    expect(result.current.plan).not.toBeNull();
  });

  it("complete() writes suppression and flips status to done", async () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Old task" })],
    });

    const { result } = renderHook(() => useReEntryRitual({ state, now: NOW }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    result.current.complete();

    await waitFor(() => expect(result.current.status).toBe("done"));

    const stored = JSON.parse(
      window.localStorage.getItem("lifeos.moments.reentry") ?? "{}",
    );
    expect(stored.completedForLastActivityAt).toBeTruthy();
  });

  it("is suppressed (idle) on a fresh hook instance once completed for the same absence", async () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Old task" })],
    });

    const first = renderHook(() => useReEntryRitual({ state, now: NOW }));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.result.current.complete();
    first.unmount();

    const second = renderHook(() => useReEntryRitual({ state, now: NOW }));
    expect(second.result.current.status).toBe("idle");
  });

  it("respects enabled: false", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Old task" })],
    });

    const { result } = renderHook(() =>
      useReEntryRitual({ state, now: NOW, enabled: false }),
    );

    expect(result.current.status).toBe("idle");
  });
});
