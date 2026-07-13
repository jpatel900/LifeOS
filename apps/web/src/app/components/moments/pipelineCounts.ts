import type { WorkflowState } from "@/lib/workflow";

/**
 * Pure, presentation-only derivation of actionable per-stage pipeline counts
 * for the moments Pipeline stage rail. These selectors intentionally count
 * work that needs attention now, not historical rows retained in state.
 */

export const PIPELINE_OVERVIEW_STAGES = [
  "capture",
  "triage",
  "plan",
  "execute",
  "review",
] as const;

export type PipelineOverviewStage = (typeof PIPELINE_OVERVIEW_STAGES)[number];

export interface PipelineCountOptions {
  now?: Date;
}

function activeAreaId(state: WorkflowState, selectedAreaId: string | null) {
  return (
    state.areas.find((area) => area.id === selectedAreaId)?.id ??
    state.areas[0]?.id ??
    null
  );
}

function isSameCalendarDay(value: string, now: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function hasOpenBlockToday(
  state: WorkflowState,
  taskId: string,
  now: Date,
): boolean {
  return state.calendarBlocks.some(
    (block) =>
      block.task_id === taskId &&
      ["scheduled", "running"].includes(block.status) &&
      isSameCalendarDay(block.start_at, now),
  );
}

export function buildPipelineCounts(
  state: WorkflowState,
  selectedAreaId: string | null = null,
  options: PipelineCountOptions = {},
): Record<PipelineOverviewStage, number> {
  const areaId = activeAreaId(state, selectedAreaId);
  if (!areaId) {
    return { capture: 0, triage: 0, plan: 0, execute: 0, review: 0 };
  }

  const now = options.now ?? new Date();
  const actionableCapture = state.captureItems.filter(
    (item) => item.area_id === areaId && item.status === "new",
  );
  const pendingDrafts = state.taskDrafts.filter(
    (draft) => draft.area_id === areaId && draft.status === "pending",
  );
  const doTodayUnplacedTasks = state.tasks.filter(
    (task) =>
      task.area_id === areaId &&
      task.status === "active" &&
      !hasOpenBlockToday(state, task.id, now),
  );
  const plannedUnstartedBlocksToday = state.calendarBlocks.filter(
    (block) =>
      block.area_id === areaId &&
      block.status === "scheduled" &&
      Boolean(block.task_id) &&
      isSameCalendarDay(block.start_at, now),
  );
  const todayBlocksAwaitingReview = state.calendarBlocks.filter(
    (block) =>
      block.area_id === areaId &&
      ["completed", "missed"].includes(block.status) &&
      isSameCalendarDay(block.start_at, now),
  );
  const todaySessionsAwaitingReview = state.executionSessions.filter(
    (session) => {
      if (session.area_id !== areaId) return false;
      if (
        !["completed", "missed", "stuck", "stopped", "distracted"].includes(
          session.status,
        )
      ) {
        return false;
      }
      const linkedBlock = state.calendarBlocks.find(
        (block) => block.id === session.calendar_block_id,
      );
      return linkedBlock ? isSameCalendarDay(linkedBlock.start_at, now) : false;
    },
  );
  const reviewedBlockIds = new Set(
    todaySessionsAwaitingReview
      .map((session) => session.calendar_block_id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    capture: actionableCapture.length,
    triage: pendingDrafts.length,
    plan: doTodayUnplacedTasks.length,
    execute: plannedUnstartedBlocksToday.length,
    review:
      todaySessionsAwaitingReview.length +
      todayBlocksAwaitingReview.filter(
        (block) => !reviewedBlockIds.has(block.id),
      ).length,
  };
}
