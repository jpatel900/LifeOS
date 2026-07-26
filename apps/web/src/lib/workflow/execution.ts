import type { Phase2MockExecutionSession } from "../types";
import { WIP_ENFORCEMENT_LIMIT, nextId, type WorkflowState } from "./shared";
import { getWipSlotHolders, withWipRefusal } from "./wip";

/**
 * Statuses a task can be in when the user presses "Start now".
 *
 * #737 C1 card 1 / audit P0#2: this used to be `"scheduled"` ALONE, so
 * pressing "Start now" on the Start moment's "oldest active commitment" — a
 * task with no block, status `"active"` — silently returned the state
 * unchanged. The clock still ran, the end sheet still opened, `Save` still
 * said "Session complete", and nothing was ever recorded anywhere.
 *
 * The server was never the blocker: `start_execution_session`
 * (`supabase/migrations/20260630180000_add_cockpit_persistence_transition_functions.sql`)
 * already accepts `p_calendar_block_id => null` and derives planned minutes
 * from the task estimate. The refusal was purely this line.
 */
const STARTABLE_TASK_STATUSES = ["scheduled", "active"];

/**
 * The one session the user is actually in, if any.
 *
 * Callers used to reach for `state.executionSessions[0]`. That is the newest
 * row, which after `syncPersistedWorkflow` (ordered `created_at desc`) is
 * whatever the account returned last — not necessarily a live session. With
 * P0#2 fixed, blockless starts create sessions too, so an index-based lookup
 * would have upgraded "writes nothing" into "writes the outcome onto the
 * wrong session".
 *
 * WHY `outcome === "in_progress"` AND NOT `status === "running"`
 * --------------------------------------------------------------
 * Because status is not a discriminator here — it is DERIVED. Every session
 * the old `start_execution_session` abandoned sits in real databases as
 * `outcome:'partial' + actual_minutes:null`, and `sessionStatusFromOutcome`
 * (`lib/data/workflowPersistedNormalization.ts`) reads exactly that pair back
 * as status `"running"`. Those ghosts arrive from the account on every
 * rehydrate, and `mergePersistedRows` puts them AHEAD of the local live
 * session (persisted rows first, local rows appended). A status-based search
 * would therefore find last Tuesday's abandoned session and file today's
 * chosen outcome — and today's journalled account write — against ITS task.
 *
 * `in_progress` cannot be forged by a ghost: it is device-only and
 * `execution_sessions_outcome_check` refuses it, so no row that came from the
 * account can ever carry it. Paused sessions keep it too (`markCurrentSession`
 * leaves the outcome alone for a pause, because pausing is not a verdict), so
 * they stay findable.
 */
export function findLiveSession(
  state: WorkflowState,
): Phase2MockExecutionSession | null {
  return (
    state.executionSessions.find(
      (session) => session.outcome === "in_progress",
    ) ?? null
  );
}

export function startExecutionSession(
  state: WorkflowState,
  taskId: string,
): WorkflowState {
  const task = state.tasks.find(
    (item) =>
      item.id === taskId && STARTABLE_TASK_STATUSES.includes(item.status),
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
    // Not "partial". A session that has only just started has no verdict, and
    // saying otherwise is the exact lie audit P0#1 recorded in the database.
    outcome: "in_progress",
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
  const current = findLiveSession(state);
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
    executionSessions: state.executionSessions.map((session) =>
      session.id === current.id
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
