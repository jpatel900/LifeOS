import { describe, expect, it } from "vitest";
import { deferTask, updateTaskFirstTinyStep } from "@/lib/workflow";
import { PersistenceWriteError } from "@/lib/persistenceFailureKind";
import {
  acceptLatestDraft,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import {
  classifyTaskReviewWriteFailure,
  revertTaskReviewTransition,
} from "./taskReviewRefusal";

describe("classifyTaskReviewWriteFailure", () => {
  it.each([
    [
      new PersistenceWriteError(
        "Google-backed blocks require calendar approval before changing this task.",
        "unknown",
      ),
      "refused-google-event",
    ],
    [
      new PersistenceWriteError("Review task was not found.", "unknown"),
      "refused-task-missing",
    ],
    [
      new PersistenceWriteError(
        "Synthetic missing server capability",
        "server-capability-missing",
      ),
      "refused-needs-app-update",
    ],
    [{ code: "PGRST202", message: "missing" }, "refused-needs-app-update"],
    [new Error("Sign in before saving review task choices."), "signed-out"],
    [new Error("Failed to fetch"), "transient"],
    [undefined, "transient"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(classifyTaskReviewWriteFailure(error)).toBe(expected);
  });
});

describe("revertTaskReviewTransition", () => {
  function planned() {
    const state = planLatestActiveTask(
      acceptLatestDraft(captureWorkflow(workflowSeed(), "Synthetic task")),
    );
    const block = state.calendarBlocks.find((item) =>
      ["scheduled", "running"].includes(item.status),
    );
    expect(block).toBeDefined();
    return { state, taskId: block!.task_id! };
  }

  it("returns the exact previous state when nothing happened since", () => {
    const { state: previous, taskId } = planned();
    const next = deferTask(previous, taskId);
    expect(revertTaskReviewTransition(next, previous, next, taskId)).toBe(
      previous,
    );
  });

  it("restores only what the transition changed when other work landed since", () => {
    const { state, taskId } = planned();
    const other = acceptLatestDraft(captureWorkflow(state, "Synthetic other"));
    const otherId = other.tasks.find((task) => task.title === "Synthetic other")!
      .id;
    const previous = other;
    const next = deferTask(previous, taskId);
    const current = updateTaskFirstTinyStep(next, otherId, "Open the file");

    const reverted = revertTaskReviewTransition(current, previous, next, taskId);
    expect(reverted).not.toBeNull();
    expect(reverted!.tasks.find((task) => task.id === taskId)).toBe(
      previous.tasks.find((task) => task.id === taskId),
    );
    expect(reverted!.calendarBlocks).toEqual(previous.calendarBlocks);
    expect(reverted!.tasks.find((task) => task.id === otherId)).toBe(
      current.tasks.find((task) => task.id === otherId),
    );
    expect(reverted!.reviewLog).toEqual(current.reviewLog.slice(1));
  });

  it("refuses to undo a newer change to the same task", () => {
    const { state: previous, taskId } = planned();
    const next = deferTask(previous, taskId);
    const current = updateTaskFirstTinyStep(next, taskId, "Newer step");
    expect(
      revertTaskReviewTransition(current, previous, next, taskId),
    ).toBeNull();
  });
});
