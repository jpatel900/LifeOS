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

/**
 * #691 / C2-S5: the scope these counts describe. `null` means **All areas** —
 * genuinely every area — and it is returned for exactly two inputs: nothing
 * selected, and an id the shared area list cannot resolve. Neither may fall
 * back to `state.areas[0]`.
 *
 * That fallback is what this fixes. It made the rail's headline numbers
 * describe area 1 while the picker directly above them said "All areas" —
 * the residual #691's own fix left open and `lib/cockpit/viewModel.ts`
 * recorded as an AGENT-TODO. An unresolvable id gets the same answer for the
 * same reason: "I cannot find that area" is not evidence that area 1 is the
 * one you meant.
 *
 * Deliberately NOT changed: `lib/areaAccent.ts`'s `resolveSelectedArea`. That
 * one picks an accent *colour*, and a colour genuinely needs some value to
 * fall back to. Only the resolvers that scope *data* must refuse to guess.
 */
function scopeAreaId(
  state: WorkflowState,
  selectedAreaId: string | null,
): string | null {
  return state.areas.find((area) => area.id === selectedAreaId)?.id ?? null;
}

export function buildPipelineCounts(
  state: WorkflowState,
  selectedAreaId: string | null = null,
  options: PipelineCountOptions = {},
): Record<PipelineOverviewStage, number> {
  const areaId = scopeAreaId(state, selectedAreaId);
  if (state.areas.length === 0) {
    return { capture: 0, triage: 0, plan: 0, execute: 0, review: 0 };
  }
  /** `null` scope counts every area; a resolved scope counts only that one. */
  const inScope = (rowAreaId: string | null | undefined) =>
    areaId === null ? true : rowAreaId === areaId;

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
    (draft) => inScope(draft.area_id) && draft.status === "pending",
  );
  // C2-S2: this rule now lives in `lib/workflow/planStatus`, shared with the
  // cockpit Plan chip and the ported Plan sheet's "To place" list, so a badge
  // can never disagree with the list it points at (planStatus.test.ts).
  // C2-S5: an All-areas scope runs that SAME rule once per area rather than
  // reimplementing it here, so the shared definition stays the only one.
  const doTodayUnplacedTasks =
    areaId === null
      ? state.areas.flatMap((area) => selectTasksToPlace(state, area.id, now))
      : selectTasksToPlace(state, areaId, now);
  const plannedUnstartedBlocksToday = state.calendarBlocks.filter(
    (block) =>
      inScope(block.area_id) &&
      block.status === "scheduled" &&
      Boolean(block.task_id) &&
      isSameCalendarDay(block.start_at, now),
  );
  const todayBlocksAwaitingReview = state.calendarBlocks.filter(
    (block) =>
      inScope(block.area_id) &&
      ["completed", "missed"].includes(block.status) &&
      isSameCalendarDay(block.start_at, now),
  );
  const todaySessionsAwaitingReview = state.executionSessions.filter(
    (session) => {
      if (!inScope(session.area_id)) return false;
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
