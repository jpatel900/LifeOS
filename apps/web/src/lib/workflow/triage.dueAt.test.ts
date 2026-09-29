import { describe, expect, it } from "vitest";
import {
  acceptDraft,
  backlogDraft,
  editDraft,
  promoteBacklogTask,
} from "./triage";
import {
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { editBacklogTaskInState } from "./taskEditing";
import { deferTask } from "./review";
import { localNoonIsoForDay, selectBackTodayTasks } from "./backToday";

/**
 * FR-049 (#1025) acceptance criterion: "Accepting an AI draft no longer
 * copies the draft's due_at into a new ordinary task ... Decision tasks
 * are the one exception ... Accept keeps copying a decision draft's
 * deadline."
 *
 * This is the demo/local half of the accept-mapping gate
 * (`lib/workflow/triage.ts`'s `acceptDraftWithStatus`, reached by both
 * `acceptDraft` and `backlogDraft`). The persisted half is covered by
 * `lib/data/workflow/draftAccept.test.ts`.
 */

const DUE_AT = "2026-09-30T16:00:00.000Z";

function stateWithDraftDueAt(taskType: "task" | "decision" | undefined) {
  let state = captureWorkflow(workflowSeed(), "Someday review old notes.");
  const draftId = state.taskDrafts[0]!.id;
  state = editDraft(state, draftId, { first_tiny_step: "Open the old notes." });

  // Parser boundary: exercise incoming draft dates/types without hand-building state.
  return {
    ...state,
    taskDrafts: state.taskDrafts.map((draft) =>
      draft.id === draftId
        ? { ...draft, due_at: DUE_AT, task_type: taskType }
        : draft,
    ),
  };
}
describe("accept mapping never copies an ordinary draft's due_at (#1025)", () => {
  it("drops due_at on accept-to-active for a plain (no task_type) draft", () => {
    const state = stateWithDraftDueAt(undefined);
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("drops due_at on accept-to-active for an explicit task_type: 'task' draft", () => {
    const state = stateWithDraftDueAt("task");
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("drops due_at on backlog-accept for an ordinary draft", () => {
    const state = stateWithDraftDueAt("task");
    const next = backlogDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBeNull();
  });

  it("keeps due_at on accept for a decision draft", () => {
    const state = stateWithDraftDueAt("decision");
    const next = acceptDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBe(DUE_AT);
  });

  it("keeps due_at on backlog-accept for a decision draft", () => {
    const state = stateWithDraftDueAt("decision");
    const next = backlogDraft(state, state.taskDrafts[0]!.id);
    expect(next.tasks[0]!.due_at).toBe(DUE_AT);
  });
});

describe("Move to today consumes an ordinary return day (FR-049)", () => {
  const now = new Date(2026, 8, 30, 12);
  const returnDay = localNoonIsoForDay("2026-09-30");

  function datedBacklog(taskType: "task" | "decision" | null) {
    const drafted = stateWithDraftDueAt(taskType ?? undefined);
    let backlogged = backlogDraft(drafted, drafted.taskDrafts[0]!.id);
    const task = backlogged.tasks[0]!;
    if (taskType === null) {
      // Account-load boundary: legacy ordinary rows can have a NULL task_type.
      backlogged = {
        ...backlogged,
        tasks: backlogged.tasks.map((item) =>
          item.id === task.id ? { ...item, task_type: null } : item,
        ),
      };
    }
    return editBacklogTaskInState(backlogged, task.id, {
      title: task.title,
      description: task.description,
      area_id: task.area_id,
      due_at: returnDay,
    }).state;
  }
  it.each(["task", null] as const)(
    "clears the return day for an ordinary %s task so deferring again does not bring it back",
    (taskType) => {
      const state = datedBacklog(taskType);
      const taskId = state.tasks[0]!.id;
      expect(selectBackTodayTasks(state.tasks, null, now)).toHaveLength(1);

      const promoted = promoteBacklogTask(state, taskId);
      expect(promoted.tasks[0]!.status).toBe("active");
      expect(selectBackTodayTasks(promoted.tasks, null, now)).toHaveLength(0);
      const deferredAgain = deferTask(promoted, taskId);
      expect(deferredAgain.tasks[0]!.status).toBe("backlog");
      expect(selectBackTodayTasks(deferredAgain.tasks, null, now)).toHaveLength(
        0,
      );
      expect(promoted.tasks[0]!.due_at).toBeNull();
      expect(deferredAgain.tasks[0]!.due_at).toBeNull();
    },
  );

  it("retains a decision deadline when promoted and deferred again (FR-024)", () => {
    const state = datedBacklog("decision");
    const taskId = state.tasks[0]!.id;
    const promoted = promoteBacklogTask(state, taskId);
    expect(promoted.tasks[0]!.status).toBe("active");
    expect(promoted.tasks[0]!.due_at).toBe(returnDay);
    expect(selectBackTodayTasks(promoted.tasks, null, now)).toHaveLength(0);

    const deferredAgain = deferTask(promoted, taskId);
    expect(deferredAgain.tasks[0]!.status).toBe("backlog");
    expect(deferredAgain.tasks[0]!.due_at).toBe(returnDay);
    expect(selectBackTodayTasks(deferredAgain.tasks, null, now)).toHaveLength(
      1,
    );
  });
});
