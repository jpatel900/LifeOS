import type { Phase2MockTask } from "@/lib/types";
import type { WorkflowState } from "./shared";

/**
 * Final UX Loop C2-S2 — one definition of "this still needs placing".
 *
 * ## Why this module exists
 *
 * The same rule was written out three times: `pipelineCounts.ts`'s Plan badge,
 * `lib/cockpit/viewModel.ts`'s Plan chip, and the ported Plan surface's own
 * "To place" list. Three copies of one rule is how a badge and the list it
 * points at end up disagreeing — exactly the defect class C1's
 * `captureStatus.ts` was built to end for capture, and this is its Plan twin.
 *
 * The divergence was real, not theoretical. In the `KNOWN_ISSUES` row 11 state
 * (a stale `accept_time_block_proposal` left `calendar_blocks` at `scheduled`
 * while the linked task stayed `active` — pinned by
 * `__tests__/cockpitScheduledTaskStatusJoin.test.ts`) the badge counted the
 * task as placed and the list offered it as unplaced, side by side on the same
 * screen: the moments home's Pipeline rail sits directly beside the open Plan
 * sheet.
 *
 * ## The rule
 *
 * Something needs placing when it is a do-today task in this area that does
 * not already hold an open block on today's rail. Local calendar day, not UTC
 * — a block is "on today's rail" exactly when the rail would draw it.
 */

export function isSameCalendarDay(value: string, now: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function hasOpenBlockToday(
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

/**
 * Every task still waiting for an hour, in one area.
 *
 * A new surface answering "what is left to place?" must call this, or the
 * agreement guard in `planStatus.test.ts` silently stops covering it.
 */
export function selectTasksToPlace(
  state: WorkflowState,
  areaId: string | null,
  now: Date,
): Phase2MockTask[] {
  if (!areaId) return [];
  return state.tasks.filter(
    (task) =>
      task.area_id === areaId &&
      task.status === "active" &&
      !hasOpenBlockToday(state, task.id, now),
  );
}
