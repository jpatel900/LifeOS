import { describe, expect, it } from "vitest";
import {
  acceptedReversibleDecisionDueAt,
  backlogLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { localNoonIsoForDay, selectBackTodayTasks } from "./backToday";
import { editBacklogTaskInState } from "./taskEditing";
import { carryForwardTask, deferTask } from "./review";

const NOW = new Date(2026, 8, 30, 12);
const RETURN_DAY = localNoonIsoForDay("2026-09-30");

describe("Carry-forward consumes ordinary return days (FR-049)", () => {
  it("does not bring an ordinary task back after carrying forward and deferring again", () => {
    const captured = captureWorkflow(
      workflowSeed(),
      "Prepare the volunteer rota",
    );
    const backlogged = backlogLatestDraft(captured);
    const task = backlogged.tasks[0]!;
    const edited = editBacklogTaskInState(backlogged, task.id, {
      title: task.title,
      description: task.description,
      area_id: task.area_id,
      due_at: RETURN_DAY,
    });
    expect(edited.task?.due_at).toBe(RETURN_DAY);
    expect(selectBackTodayTasks(edited.state.tasks, null, NOW)).toHaveLength(1);

    const carried = carryForwardTask(edited.state, task.id);
    expect(carried.tasks[0]!.status).toBe("active");
    expect(selectBackTodayTasks(carried.tasks, null, NOW)).toHaveLength(0);

    const deferredAgain = deferTask(carried, task.id);
    expect(deferredAgain.tasks[0]!.status).toBe("backlog");
    expect(selectBackTodayTasks(deferredAgain.tasks, null, NOW)).toHaveLength(
      0,
    );
    expect(carried.tasks[0]!.due_at).toBeNull();
    expect(deferredAgain.tasks[0]!.due_at).toBeNull();
  });

  it("keeps a decision deadline through carry-forward and another deferral (FR-024)", () => {
    const accepted = acceptedReversibleDecisionDueAt(
      workflowSeed(),
      RETURN_DAY,
    );
    const taskId = accepted.tasks[0]!.id;
    const backlogged = deferTask(accepted, taskId);
    expect(selectBackTodayTasks(backlogged.tasks, null, NOW)).toHaveLength(1);

    const carried = carryForwardTask(backlogged, taskId);
    expect(carried.tasks[0]!.status).toBe("active");
    expect(carried.tasks[0]!.due_at).toBe(RETURN_DAY);
    expect(selectBackTodayTasks(carried.tasks, null, NOW)).toHaveLength(0);

    const deferredAgain = deferTask(carried, taskId);
    expect(deferredAgain.tasks[0]!.status).toBe("backlog");
    expect(deferredAgain.tasks[0]!.due_at).toBe(RETURN_DAY);
    expect(selectBackTodayTasks(deferredAgain.tasks, null, NOW)).toHaveLength(
      1,
    );
  });
});
