import type { WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockTask,
} from "@/lib/types";

/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * Shared helpers/types used by two or more of the per-moment view-model
 * modules (`start.ts`, `flow.ts`, `close.ts`). Pure selectors, no
 * fetches/writes — same contract as the per-moment modules themselves; see
 * their doc comments for the full rationale.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_MINUTE = 60 * 1000;

export function isSameCalendarDay(isoA: string, dateB: Date): boolean {
  const a = new Date(isoA);
  return (
    a.getFullYear() === dateB.getFullYear() &&
    a.getMonth() === dateB.getMonth() &&
    a.getDate() === dateB.getDate()
  );
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / MS_PER_MINUTE,
  );
}

export function areaName(
  areas: Phase2MockArea[],
  areaId: string | null,
): string {
  if (!areaId) return "";
  return areas.find((area) => area.id === areaId)?.name ?? "";
}

export function taskTitle(state: WorkflowState, taskId: string | null): string {
  if (!taskId) return "Focus block";
  return state.tasks.find((task) => task.id === taskId)?.title ?? "Focus block";
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface ScheduleBlockVM {
  id: string;
  title: string;
  meta: string;
  state: "done" | "now" | "upcoming" | "free";
  startAt: string;
  endAt: string | null;
}

export interface FirstMoveVM {
  title: string;
  why: string;
  areaLabel: string;
  estMinutes: number;
  taskId: string | null;
}

/** Time-derived subset of a calendar block, enough to place it on the timeline. */
export type TimelineBlockInput = Pick<
  Phase2MockCalendarBlock,
  "status" | "start_at" | "end_at"
>;

/**
 * D-5 (design alignment, #483) — pure done/now/upcoming derivation, extracted
 * from `buildTodayBlocks` so the row-state rule is independently unit
 * testable. A block is "done" once its status is `completed`; "now" while
 * `running` (status overrides the clock — an explicitly-started block stays
 * "now" even if the clock has drifted past its planned end) or while `now`
 * falls inside `[start_at, end_at)`; otherwise "upcoming". No `Date.now()` —
 * `now` is always caller-supplied, matching every other builder here.
 * "free" is deliberately not a return value: v0 has no gap-row synthesis
 * (see `buildTodayBlocks`'s doc comment), so no real block ever resolves to
 * it — `ScheduleBlockVM.state` keeps that union member for P2 rendering only.
 */
export function blockTimelineState(
  block: TimelineBlockInput,
  now: Date,
): "done" | "now" | "upcoming" {
  if (block.status === "completed") {
    return "done";
  }

  const startMs = new Date(block.start_at).getTime();
  const endMs = new Date(block.end_at).getTime();
  const nowMs = now.getTime();

  if (block.status === "running" || (startMs <= nowMs && nowMs < endMs)) {
    return "now";
  }

  return "upcoming";
}

/**
 * Today's non-cancelled calendar blocks mapped to schedule rows, sorted by
 * start time. "Today" = same calendar day as `now`. No gap/"free" row
 * synthesis in v0 (the `state` union member exists for P2 rendering only).
 */
export function buildTodayBlocks(
  state: WorkflowState,
  now: Date,
): ScheduleBlockVM[] {
  return state.calendarBlocks
    .filter(
      (block) =>
        block.status !== "cancelled" && isSameCalendarDay(block.start_at, now),
    )
    .map(
      (block): ScheduleBlockVM => ({
        id: block.id,
        title: taskTitle(state, block.task_id),
        meta: areaName(state.areas, block.area_id),
        state: blockTimelineState(block, now),
        startAt: block.start_at,
        endAt: block.end_at,
      }),
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

export function findBlockByState(
  blocks: ScheduleBlockVM[],
  state: ScheduleBlockVM["state"],
): ScheduleBlockVM | null {
  return blocks.find((block) => block.state === state) ?? null;
}

export function findRawBlock(
  state: WorkflowState,
  blockId: string,
): Phase2MockCalendarBlock | undefined {
  return state.calendarBlocks.find((block) => block.id === blockId);
}

/**
 * Active tasks scoped to `selectedAreaId` (falling back to all areas when
 * the scoped pool is empty), ordered oldest-first by `created_at`. This is
 * the existing priority ordering used by `deriveFirstMove`'s task fallback
 * and by the S5 focus-item list (#257) — both read from this single
 * ranking so "oldest active commitment" means the same thing everywhere.
 */
export function orderedActiveTasks(
  state: WorkflowState,
  selectedAreaId?: string | null,
): Phase2MockTask[] {
  const scoped = selectedAreaId
    ? state.tasks.filter(
        (task) => task.status === "active" && task.area_id === selectedAreaId,
      )
    : [];

  const pool =
    scoped.length > 0
      ? scoped
      : state.tasks.filter((task) => task.status === "active");

  return [...pool].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export function oldestActiveTask(
  state: WorkflowState,
  selectedAreaId?: string | null,
): Phase2MockTask | null {
  return orderedActiveTasks(state, selectedAreaId)[0] ?? null;
}

export interface NowOption {
  now: Date;
}
