import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import type { UseReEntryRitualResult } from "./useReEntryRitual";
import { useReEntryRecovery } from "./useReEntryRecovery";

describe("empty recovery step", () => {
  it.each(["", "   "])("explains what to add for %j", (firstStep) => {
    const state = acceptLatestDraft(
      captureWorkflow(workflowSeed(), "Draft a synthetic example"),
    );
    const task = state.tasks[0];
    task.first_tiny_step = firstStep;
    const ritual: UseReEntryRitualResult = {
      status: "ready",
      summary: {
        absenceDays: 3,
        lapsedBlocks: [],
        counts: { lapsedBlocks: 0, pendingTriage: 0, activeTasks: 1 },
        stalest: { kind: "task", id: task.id, label: task.title, ageDays: 3 },
      },
      plan: { taskDeferrals: [], blockUnplans: [], requiresApproval: [] },
      outcomes: [],
      demoMode: true,
      pending: false,
      checkpoint: null,
      complete: vi.fn(),
      editRecovery: vi.fn(),
      selectRecovery: vi.fn(),
    };
    const input = {
      state,
      ritual,
      updateTaskFirstTinyStep: vi.fn(),
      promoteBacklogTask: vi.fn(() => state),
      clearWipRefusal: vi.fn(),
      showToast: vi.fn(),
      deferTask: vi.fn(),
      setMoment: vi.fn(),
    };
    const { result } = renderHook(() => useReEntryRecovery(input));

    act(() => result.current.onAcceptRecovery(task.id));

    expect(input.showToast).toHaveBeenCalledExactlyOnceWith(
      "Add a first step, then try again.",
    );
    expect(input.updateTaskFirstTinyStep).not.toHaveBeenCalled();
    expect(input.promoteBacklogTask).not.toHaveBeenCalled();
    expect(ritual.complete).not.toHaveBeenCalled();
    expect(input.setMoment).not.toHaveBeenCalled();
  });
});
