import { getPersistenceFailureKind } from "../persistenceFailureKind";
import type { WorkflowState } from "../workflow/shared";
import { hasServerCapabilityMissingSignal, isSignedOutError } from "./reducerCore";
import type { TaskReviewAccountRefusal } from "./types";

/**
 * Why a Review "Carry forward" / "Put off" write did not land, sorted by what
 * the person can do about it.
 *
 * - A `TaskReviewAccountRefusal` is deterministic: the same write sent again
 *   gets the same answer, so the copy must name the real way out instead of
 *   offering a retry that can never work.
 * - `signed-out` is the ordinary device-only state, reported like the
 *   no-client path.
 * - `transient` is everything else (network, timeouts, a 5xx). Trying again
 *   may work, so it is the only case allowed to say so.
 *
 * The refusal texts are the exact `raise exception` messages of
 * `apply_task_review_transition` (supabase/migrations/
 * 20260929120000_clear_ordinary_return_day_on_promotion.sql). They are matched
 * case-insensitively on a stable fragment so a punctuation edit in SQL does
 * not silently demote a refusal to a "try again".
 */
export function classifyTaskReviewWriteFailure(
  error: unknown,
): TaskReviewAccountRefusal | "signed-out" | "transient" {
  if (isSignedOutError(error)) return "signed-out";
  if (
    getPersistenceFailureKind(error) === "server-capability-missing" ||
    hasServerCapabilityMissingSignal(error)
  ) {
    return "refused-needs-app-update";
  }
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");
  if (message.includes("google-backed blocks require calendar approval")) {
    return "refused-google-event";
  }
  if (message.includes("review task was not found")) {
    return "refused-task-missing";
  }
  return "transient";
}

/**
 * Takes a refused Review transition back off the screen.
 *
 * `next` is the optimistic state the transition applied on top of `previous`;
 * `current` is the state now. When nothing else has happened since, this is
 * simply `previous`. Otherwise only the rows the transition itself changed are
 * restored, and only while they are still exactly what it wrote — a newer
 * change to the same task (another tap, an account readback) is never undone.
 * Returns `null` when the task has moved on, so the caller can report that
 * the screen and the account disagree instead of guessing.
 */
export function revertTaskReviewTransition(
  current: WorkflowState,
  previous: WorkflowState,
  next: WorkflowState,
  taskId: string,
): WorkflowState | null {
  if (current === next) return previous;

  const optimisticTask = next.tasks.find((task) => task.id === taskId);
  const previousTask = previous.tasks.find((task) => task.id === taskId);
  const currentTask = current.tasks.find((task) => task.id === taskId);
  if (!optimisticTask || !previousTask || currentTask !== optimisticTask) {
    return null;
  }

  const previousBlocks = new Map(
    previous.calendarBlocks.map((block) => [block.id, block]),
  );
  const optimisticBlocks = new Map(
    next.calendarBlocks.map((block) => [block.id, block]),
  );

  const logLine = next.reviewLog[0];
  const logIndex =
    next.reviewLog !== previous.reviewLog && logLine !== undefined
      ? current.reviewLog.indexOf(logLine)
      : -1;

  return {
    ...current,
    tasks: current.tasks.map((task) =>
      task.id === taskId ? previousTask : task,
    ),
    calendarBlocks: current.calendarBlocks.map((block) => {
      const before = previousBlocks.get(block.id);
      return before &&
        optimisticBlocks.get(block.id) === block &&
        before !== block
        ? before
        : block;
    }),
    reviewLog:
      logIndex === -1
        ? current.reviewLog
        : current.reviewLog.filter((_, index) => index !== logIndex),
  };
}
