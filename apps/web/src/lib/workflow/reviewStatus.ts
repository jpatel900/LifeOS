import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import type { WorkflowState } from "./shared";

/**
 * Final UX Loop C2-S3 — one definition of "this still needs a decision".
 *
 * ## Why this module exists
 *
 * The third of the shared count definitions, after C1's `captureStatus.ts` and
 * C2-S2's `planStatus.ts`, and it is here for the same reason: **a count and
 * the list it points at are one deliverable.**
 *
 * The divergence was measured, not theoretical. FINDING 5 of the C2-S1
 * capability inventory (#687) found the legacy `/review` screen showing three
 * numbers for one workload at the same instant — headline **6**, stage chip
 * **3**, cards actually rendered **3** — because the headline added
 * `today.length` and `backlog.length` to `reviewQueue.length` and
 * `reviewQueue` already contains every one of those tasks.
 *
 * The derivation used to live inline in `buildCockpitViewModel`. Moving it here
 * makes the rule callable by a surface that needs the count WITHOUT building a
 * whole cockpit view model — which is exactly what the ported moments Review
 * sheet needs, and exactly the situation that produced a second, wrong copy of
 * the rule last time.
 *
 * ## The rule
 *
 * Something needs a decision when, in this area, it is:
 *
 * - an execution session that did not go to plan (`stuck`, `missed`,
 *   `stopped`, `distracted`, `partial`, `skipped`), or
 * - a calendar block the day went past (`missed`), or
 * - a task the user marked `blocked`, or
 * - a `active` (do-today) task, or
 * - a `backlog` task.
 *
 * Deduped by task id, first reason wins — so one task that both missed a block
 * and sits in the backlog is ONE decision, not two.
 *
 * ## What it deliberately does NOT cover, and why the label matters
 *
 * A `scheduled` task is open work and is **not** here: it has an hour, so
 * there is nothing to decide about it on a review surface. That is correct,
 * and it is why no surface may head this list with words claiming to cover
 * everything still open (the "carry over" half of FINDING 5). A count that
 * agrees with its list under a label that overclaims is still a lying count.
 *
 * A new surface answering "what still needs a decision?" must call this, or
 * the agreement guard in `reviewStatus.test.ts` silently stops covering it.
 */

export type ReviewQueueReason =
  | "open"
  | "backlog"
  | "stuck"
  | "missed"
  | "partial";

export interface ReviewQueueItem {
  task: Phase2MockTask;
  block: Phase2MockCalendarBlock | null;
  session: Phase2MockExecutionSession | null;
  reason: ReviewQueueReason;
}

const FAILED_SESSION_STATUSES = [
  "stuck",
  "missed",
  "stopped",
  "distracted",
  "partial",
  "skipped",
];

function dedupeByTask(items: ReviewQueueItem[]): ReviewQueueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.task.id)) return false;
    seen.add(item.task.id);
    return true;
  });
}

/**
 * Every open item in one area that is waiting on a carry-forward / defer /
 * drop decision, deduped by task.
 */
export function selectNeedsDecision(
  state: WorkflowState,
  areaId: string | null,
): ReviewQueueItem[] {
  if (!areaId) return [];

  const fromSessions = state.executionSessions
    .filter(
      (session) =>
        session.area_id === areaId &&
        FAILED_SESSION_STATUSES.includes(session.status),
    )
    .map((session) => {
      const task = state.tasks.find((item) => item.id === session.task_id);
      if (!task) return null;
      return {
        task,
        block:
          state.calendarBlocks.find(
            (item) => item.id === session.calendar_block_id,
          ) ?? null,
        session,
        reason:
          session.status === "missed" || session.status === "skipped"
            ? ("missed" as const)
            : session.status === "partial"
              ? ("partial" as const)
              : ("stuck" as const),
      };
    })
    .filter((item): item is ReviewQueueItem => Boolean(item));

  const fromMissedBlocks = state.calendarBlocks
    .filter((block) => block.area_id === areaId && block.status === "missed")
    .map((block) => {
      const task = state.tasks.find((item) => item.id === block.task_id);
      if (!task) return null;
      return {
        task,
        block,
        session:
          state.executionSessions.find(
            (session) => session.calendar_block_id === block.id,
          ) ?? null,
        reason: "missed" as const,
      };
    })
    .filter((item): item is ReviewQueueItem => Boolean(item));

  const fromBlockedTasks = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "blocked")
    .map((task) => ({
      task,
      block:
        state.calendarBlocks.find((block) => block.task_id === task.id) ?? null,
      session:
        state.executionSessions.find(
          (session) => session.task_id === task.id,
        ) ?? null,
      reason: "stuck" as const,
    }));

  const fromDoToday = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "active")
    .map((task) => ({
      task,
      block: null,
      session: null,
      reason: "open" as const,
    }));

  const fromBacklog = state.tasks
    .filter((task) => task.area_id === areaId && task.status === "backlog")
    .map((task) => ({
      task,
      block: null,
      session: null,
      reason: "backlog" as const,
    }));

  return dedupeByTask([
    ...fromSessions,
    ...fromMissedBlocks,
    ...fromBlockedTasks,
    ...fromDoToday,
    ...fromBacklog,
  ]);
}

/**
 * The number a review surface may print beside that list — and the ONLY one.
 *
 * A function rather than a bare `.length` at each call site so the agreement
 * guard has a single symbol to hold every surface to, exactly as
 * `selectTasksToPlace` does for the Plan badge.
 */
export function countNeedsDecision(items: ReviewQueueItem[]): number {
  return items.length;
}

/**
 * The headline that heads that list, in words the list can back.
 *
 * Never "carry over": see the module note above — that phrasing claims every
 * still-open item, and a `scheduled` task is still open and not in this list.
 */
export function needsDecisionHeadline(count: number): string {
  if (count === 0) return "Ready to close";
  return `${count} ${count === 1 ? "needs" : "need"} a decision`;
}
