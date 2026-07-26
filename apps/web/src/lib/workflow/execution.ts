import type { Phase2MockExecutionSession } from "../types";
import { WIP_ENFORCEMENT_LIMIT, nextId, type WorkflowState } from "./shared";
import { getWipSlotHolders, withWipRefusal } from "./wip";

export function startExecutionSession(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find(
    (item) => item.id === taskId && item.status === "scheduled",
  );
  if (!task) {
    return state;
  }
  const holdersWithoutThisTask = getWipSlotHolders(state).filter(
    (holder) => holder.task_id !== taskId,
  );
  if (holdersWithoutThisTask.length >= WIP_ENFORCEMENT_LIMIT) {
    return withWipRefusal(
      {
        ...state,
        calendarBlocks: state.calendarBlocks.filter(
          (block) => block.task_id !== taskId,
        ),
      },
      task,
      "execute_start",
    );
  }

  const block =
    state.calendarBlocks.find(
      (item) =>
        item.task_id === taskId &&
        ["scheduled", "running"].includes(item.status),
    ) ?? null;
  const session: Phase2MockExecutionSession = {
    id: nextId("session"),
    user_id: task.user_id,
    area_id: task.area_id ?? "area-main-job",
    task_id: task.id,
    calendar_block_id: block?.id ?? null,
    planned_minutes: task.estimated_minutes_high,
    actual_minutes: null,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "running",
    outcome: "partial",
    cap_outcome: null,
    notes: null,
  };

  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((item) =>
      item.id === block?.id ? { ...item, status: "running" } : item,
    ),
    executionSessions: [session, ...state.executionSessions],
    reviewLog: [`Started session: ${task.title}`, ...state.reviewLog],
  };
}

export function markCurrentSession(
  state: WorkflowState,
  status: Phase2MockExecutionSession["status"],
  options: {
    actualMinutes?: number;
    notes?: string | null;
    capOutcome?: Phase2MockExecutionSession["cap_outcome"];
  } = {},
): WorkflowState {
  const current = state.executionSessions[0];
  if (!current) {
    return state;
  }

  const outcome =
    status === "completed"
      ? "completed"
      : status === "missed"
        ? "skipped"
        : status === "distracted"
          ? "distracted"
          : status === "stuck"
            ? "blocked"
            : status === "partial"
              ? "partial"
              : status === "skipped"
                ? "skipped"
                : current.outcome;

  return {
    ...state,
    executionSessions: state.executionSessions.map((session, index) =>
      index === 0
        ? {
            ...session,
            status,
            outcome,
            cap_outcome: options.capOutcome ?? session.cap_outcome ?? null,
            actual_minutes:
              status === "paused"
                ? session.actual_minutes
                : status === "completed" ||
                    status === "missed" ||
                    status === "stuck" ||
                    status === "stopped" ||
                    status === "distracted" ||
                    status === "partial" ||
                    status === "skipped"
                  ? (options.actualMinutes ?? session.actual_minutes ?? 0)
                  : session.actual_minutes,
            distraction_minutes:
              status === "distracted" ? 10 : session.distraction_minutes,
            paused_minutes: status === "paused" ? 5 : session.paused_minutes,
            productivity_rating:
              status === "completed" ? 4 : session.productivity_rating,
            notes:
              options.notes !== undefined
                ? options.notes
                : status === "stuck"
                  ? "Need a smaller next step."
                  : session.notes,
          }
        : session,
    ),
    calendarBlocks: state.calendarBlocks.map((block) =>
      block.id === current.calendar_block_id && status === "completed"
        ? { ...block, status: "completed" }
        : block.id === current.calendar_block_id &&
            (status === "missed" ||
              status === "partial" ||
              status === "skipped")
          ? { ...block, status: "missed" }
          : block,
    ),
    tasks: state.tasks.map((task) =>
      task.id === current.task_id && status === "completed"
        ? { ...task, status: "done" }
        : task.id === current.task_id && status === "stuck"
          ? { ...task, status: "blocked" }
          : task,
    ),
    reviewLog: [`Session marked ${status}`, ...state.reviewLog],
  };
}
