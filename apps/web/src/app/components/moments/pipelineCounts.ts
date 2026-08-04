import type { WorkflowState } from "@/lib/workflow";
import { selectUnsortedCaptures } from "@/lib/workflow/captureStatus";
import {
  isSameCalendarDay,
  selectTasksToPlace,
} from "@/lib/workflow/planStatus";

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
  // C1 Target Card 4: routed through the shared "not sorted yet" definition so
  // the Capture badge can never count a thought an accepted task already came
  // from (audit P0#3). The extra `status === "new"` narrowing is this badge's
  // own long-standing semantics and is deliberately preserved: once a capture
  // has been sorted it is counted by the Triage stage instead, never twice.
  const actionableCapture = selectUnsortedCaptures(state, areaId).filter(
    (item) => item.status === "new",
  );
  const pendingDrafts = state.taskDrafts.filter(
    (draft) => draft.area_id === areaId && draft.status === "pending",
  );
  // C2-S2: this rule now lives in `lib/workflow/planStatus`, shared with the
  // cockpit Plan chip and the ported Plan sheet's "To place" list, so a badge
  // can never disagree with the list it points at (planStatus.test.ts).
  const doTodayUnplacedTasks = selectTasksToPlace(state, areaId, now);
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
