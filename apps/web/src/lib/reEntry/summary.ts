import type { WorkflowState } from "@/lib/workflow";
import type { Phase2MockCalendarBlock } from "@/lib/types";
import type { AbsenceResult } from "./detect";

/**
 * FR-028 re-entry amnesty, packet F-G2a: the "while you were out" read-model.
 *
 * Pure selectors over workflow state — rule-based aggregation only (FR-028
 * non-goal: no AI narrative), no writes. F-G2b turns `lapsedBlocks` into the
 * deterministic auto-defer batch; F-G2c renders this summary as the return
 * ritual (counts + deferral list + the one stalest thing, zero red).
 */

export interface LapsedBlockSummary {
  blockId: string;
  taskId: string | null;
  areaId: string;
  /** Title of the linked task, or null for an unlinked block. */
  taskTitle: string | null;
  endAt: string;
}

export interface StalestItemSummary {
  kind: "capture" | "task";
  id: string;
  /** Capture raw text or task title — display copy for "the one stalest thing". */
  label: string;
  ageDays: number;
}

export interface WhileYouWereOutSummary {
  absenceDays: number;
  /**
   * Scheduled blocks whose window fully passed during the absence — the
   * FR-028 auto-defer candidates, enumerated so no deferral is ever silent
   * (NS-INV-4 bounded-rule reconciliation).
   */
  lapsedBlocks: LapsedBlockSummary[];
  counts: {
    lapsedBlocks: number;
    pendingTriage: number;
    activeTasks: number;
  };
  /** Oldest still-open capture or task, or null when nothing is waiting. */
  stalest: StalestItemSummary | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function epoch(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * A block is lapsed when it is still `scheduled` and its end time fell inside
 * the absence window (after the last recorded activity, at or before now).
 * Blocks that ended before the absence began were already visible pre-absence
 * and stay in Flow 8's per-block missed-recovery lane, not the batch.
 */
function isLapsedDuringAbsence(
  block: Phase2MockCalendarBlock,
  absence: AbsenceResult,
  now: Date,
): boolean {
  if (block.status !== "scheduled") {
    return false;
  }
  const end = epoch(block.end_at);
  if (Number.isNaN(end) || end > now.getTime()) {
    return false;
  }
  if (absence.lastActivityAt === null) {
    return false;
  }
  return end > epoch(absence.lastActivityAt);
}

export function buildWhileYouWereOutSummary(input: {
  state: WorkflowState;
  absence: AbsenceResult;
  now: Date;
}): WhileYouWereOutSummary {
  const { state, absence, now } = input;

  const taskTitleById = new Map(
    state.tasks.map((task) => [task.id, task.title]),
  );

  const lapsedBlocks = state.calendarBlocks
    .filter((block) => isLapsedDuringAbsence(block, absence, now))
    .sort((a, b) => epoch(a.end_at) - epoch(b.end_at))
    .map((block) => ({
      blockId: block.id,
      taskId: block.task_id,
      areaId: block.area_id,
      taskTitle: block.task_id
        ? (taskTitleById.get(block.task_id) ?? null)
        : null,
      endAt: block.end_at,
    }));

  const pendingTriageCaptures = state.captureItems.filter(
    (capture) =>
      capture.status === "new" || capture.status === "triage_required",
  );

  const openTasks = state.tasks.filter(
    (task) =>
      task.status === "active" ||
      task.status === "scheduled" ||
      task.status === "backlog" ||
      task.status === "blocked",
  );

  let stalest: StalestItemSummary | null = null;
  const considerStalest = (candidate: {
    kind: StalestItemSummary["kind"];
    id: string;
    label: string;
    createdAt: string;
  }) => {
    const created = epoch(candidate.createdAt);
    if (Number.isNaN(created)) {
      return;
    }
    const ageDays = Math.max(
      0,
      Math.floor((now.getTime() - created) / MS_PER_DAY),
    );
    if (stalest === null || ageDays > stalest.ageDays) {
      stalest = {
        kind: candidate.kind,
        id: candidate.id,
        label: candidate.label,
        ageDays,
      };
    }
  };

  for (const capture of pendingTriageCaptures) {
    considerStalest({
      kind: "capture",
      id: capture.id,
      label: capture.raw_text,
      createdAt: capture.created_at,
    });
  }
  for (const task of openTasks) {
    considerStalest({
      kind: "task",
      id: task.id,
      label: task.title,
      createdAt: task.created_at,
    });
  }

  const activeTasks = state.tasks.filter(
    (task) => task.status === "active" || task.status === "scheduled",
  );

  return {
    absenceDays: absence.absenceDays,
    lapsedBlocks,
    counts: {
      lapsedBlocks: lapsedBlocks.length,
      pendingTriage: pendingTriageCaptures.length,
      activeTasks: activeTasks.length,
    },
    stalest,
  };
}
