import { nowIso, type WorkflowState } from "./shared";

function cancelOpenBlocksForTask(state: WorkflowState, taskId: string) {
  return state.calendarBlocks.map((block) =>
    block.task_id === taskId && ["scheduled", "running"].includes(block.status)
      ? { ...block, status: "cancelled" as const, updated_at: nowIso() }
      : block,
  );
}

export function carryForwardTask(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "active", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Carried forward: ${task.title}`, ...state.reviewLog],
  };
}

export function deferTask(state: WorkflowState, taskId: string): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "backlog", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Deferred: ${task.title}`, ...state.reviewLog],
  };
}

export function dropTask(state: WorkflowState, taskId: string): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  return {
    ...state,
    calendarBlocks: cancelOpenBlocksForTask(state, taskId),
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, status: "dropped", updated_at: nowIso() }
        : item,
    ),
    reviewLog: [`Dropped: ${task.title}`, ...state.reviewLog],
  };
}

export function saveReview(state: WorkflowState): WorkflowState {
  return {
    ...state,
    reviewLog: [`Review saved: ${nowIso()}`, ...state.reviewLog],
  };
}
