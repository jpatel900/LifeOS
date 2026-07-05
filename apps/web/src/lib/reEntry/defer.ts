import type { Phase2MockCalendarBlock } from "@/lib/types";
import {
  applyTaskReviewTransition,
  recordReEntryDeferral,
  unplanCalendarBlock,
  type MinimalSupabaseClient,
} from "@/lib/data/workflow";
import type { LapsedBlockSummary } from "./summary";

/**
 * FR-028 re-entry amnesty, packet F-G2b: the deterministic auto-defer rule.
 *
 * NS-INV-4 reconciliation (floor plan §3): this is a bounded-rule exception,
 * not a silent write — deterministic (no AI), reversible (backlog/unplan are
 * normal designed transitions), and every deferral is enumerated in the
 * "while you were out" summary before and recorded via `re_entry.v1` after.
 * No external calendar mutation ever happens here: Google-backed blocks are
 * routed to `requiresApproval` and stay Flow 8 proposals, and the underlying
 * RPCs (`apply_task_review_transition`, `unplan_calendar_block`) refuse
 * Google-backed rows at the database layer as a second fence.
 *
 * Split of labor: `planReEntryDeferrals` is pure (unit-testable rule);
 * `executeReEntryDeferrals` applies the plan through the existing reviewed
 * data-lib transitions against PERSISTED rows — callers must supply
 * persisted (uuid) identifiers, which is the F-G2c wiring's job.
 */

export interface TaskDeferral {
  taskId: string;
  areaId: string;
  taskTitle: string | null;
  /** Every lapsed block that belongs to this task (enumerated in the ritual). */
  blockIds: string[];
  lapsedBlockEndAts: string[];
}

export interface BlockUnplan {
  blockId: string;
  areaId: string;
  taskId: string | null;
  endAt: string;
}

export interface ApprovalRequired {
  blockId: string;
  taskId: string | null;
  reason: "google_backed_block" | "task_has_google_backed_block";
}

export interface ReEntryDeferralPlan {
  /** Tasks whose ONLY upcoming blocks all lapsed → task to backlog (blocks cancelled by the RPC). */
  taskDeferrals: TaskDeferral[];
  /** Lone lapsed blocks (no task, or the task still has future blocks) → unplan just that block. */
  blockUnplans: BlockUnplan[];
  /** Never auto-touched: anything whose transition would imply a Google-side change. */
  requiresApproval: ApprovalRequired[];
}

const UPCOMING_BLOCK_STATUSES = new Set(["scheduled", "running"]);

/**
 * Deterministic planning rule over the F-G2a summary:
 * 1. A lapsed block that is Google-backed → requiresApproval.
 * 2. A lapsed block whose task has ANY Google-backed upcoming block →
 *    requiresApproval (the task-level RPC would touch that block).
 * 3. A task-linked lapsed block, where ALL of the task's upcoming blocks
 *    lapsed → one task deferral to backlog (matches FR-028 "unscheduled/
 *    backlog"; the RPC cancels those blocks in the same transaction).
 * 4. Otherwise (no task, or the task still has genuinely upcoming blocks)
 *    → unplan only the lapsed block; the remaining future plan stands.
 */
export function planReEntryDeferrals(input: {
  lapsedBlocks: LapsedBlockSummary[];
  /** Full block list (same source state as the summary), for rules 2–4. */
  allBlocks: Phase2MockCalendarBlock[];
}): ReEntryDeferralPlan {
  const plan: ReEntryDeferralPlan = {
    taskDeferrals: [],
    blockUnplans: [],
    requiresApproval: [],
  };

  const lapsedIds = new Set(input.lapsedBlocks.map((block) => block.blockId));
  const upcomingByTask = new Map<string, Phase2MockCalendarBlock[]>();
  for (const block of input.allBlocks) {
    if (block.task_id && UPCOMING_BLOCK_STATUSES.has(block.status)) {
      const list = upcomingByTask.get(block.task_id) ?? [];
      list.push(block);
      upcomingByTask.set(block.task_id, list);
    }
  }

  const handledTaskIds = new Set<string>();

  for (const lapsed of input.lapsedBlocks) {
    if (lapsed.googleEventId !== null) {
      plan.requiresApproval.push({
        blockId: lapsed.blockId,
        taskId: lapsed.taskId,
        reason: "google_backed_block",
      });
      continue;
    }

    if (lapsed.taskId === null) {
      plan.blockUnplans.push({
        blockId: lapsed.blockId,
        areaId: lapsed.areaId,
        taskId: null,
        endAt: lapsed.endAt,
      });
      continue;
    }

    if (handledTaskIds.has(lapsed.taskId)) {
      continue;
    }

    const taskUpcoming = upcomingByTask.get(lapsed.taskId) ?? [];

    if (taskUpcoming.some((block) => block.google_event_id !== null)) {
      handledTaskIds.add(lapsed.taskId);
      plan.requiresApproval.push({
        blockId: lapsed.blockId,
        taskId: lapsed.taskId,
        reason: "task_has_google_backed_block",
      });
      continue;
    }

    const everyUpcomingLapsed = taskUpcoming.every((block) =>
      lapsedIds.has(block.id),
    );

    if (everyUpcomingLapsed) {
      handledTaskIds.add(lapsed.taskId);
      const taskLapsed = input.lapsedBlocks.filter(
        (block) => block.taskId === lapsed.taskId,
      );
      plan.taskDeferrals.push({
        taskId: lapsed.taskId,
        areaId: lapsed.areaId,
        taskTitle: lapsed.taskTitle,
        blockIds: taskLapsed.map((block) => block.blockId),
        lapsedBlockEndAts: taskLapsed.map((block) => block.endAt),
      });
      continue;
    }

    plan.blockUnplans.push({
      blockId: lapsed.blockId,
      areaId: lapsed.areaId,
      taskId: lapsed.taskId,
      endAt: lapsed.endAt,
    });
  }

  return plan;
}

export interface ReEntryDeferralOutcome {
  kind: "task_to_backlog" | "block_unplanned";
  subjectId: string;
  ok: boolean;
  error: string | null;
}

interface ExecuteDeps {
  applyTaskReviewTransition: typeof applyTaskReviewTransition;
  unplanCalendarBlock: typeof unplanCalendarBlock;
  recordReEntryDeferral: typeof recordReEntryDeferral;
}

const defaultDeps: ExecuteDeps = {
  applyTaskReviewTransition,
  unplanCalendarBlock,
  recordReEntryDeferral,
};

/**
 * Apply a deferral plan against persisted rows. Sequential and per-item
 * fault-isolated: one failed transition is reported in its outcome and never
 * blocks the rest of the batch (the ritual then shows what still needs a
 * hand). `requiresApproval` entries are deliberately not touched here.
 */
export async function executeReEntryDeferrals(input: {
  client: MinimalSupabaseClient;
  plan: ReEntryDeferralPlan;
  absenceDays: number;
  now: Date;
  deps?: Partial<ExecuteDeps>;
}): Promise<ReEntryDeferralOutcome[]> {
  const deps = { ...defaultDeps, ...input.deps };
  const outcomes: ReEntryDeferralOutcome[] = [];
  const resolvedAt = input.now.toISOString();

  for (const deferral of input.plan.taskDeferrals) {
    try {
      await deps.applyTaskReviewTransition(
        input.client,
        deferral.taskId,
        "backlog",
      );
      deps.recordReEntryDeferral(input.client, {
        area_id: deferral.areaId,
        subject_type: "task",
        subject_id: deferral.taskId,
        action: "task_to_backlog",
        lapsed_block_end_ats: deferral.lapsedBlockEndAts,
        absence_days: input.absenceDays,
        resolved_at: resolvedAt,
      });
      outcomes.push({
        kind: "task_to_backlog",
        subjectId: deferral.taskId,
        ok: true,
        error: null,
      });
    } catch (error) {
      outcomes.push({
        kind: "task_to_backlog",
        subjectId: deferral.taskId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const unplan of input.plan.blockUnplans) {
    try {
      await deps.unplanCalendarBlock(input.client, unplan.blockId);
      deps.recordReEntryDeferral(input.client, {
        area_id: unplan.areaId,
        subject_type: "calendar_block",
        subject_id: unplan.blockId,
        action: "block_unplanned",
        lapsed_block_end_ats: [unplan.endAt],
        absence_days: input.absenceDays,
        resolved_at: resolvedAt,
      });
      outcomes.push({
        kind: "block_unplanned",
        subjectId: unplan.blockId,
        ok: true,
        error: null,
      });
    } catch (error) {
      outcomes.push({
        kind: "block_unplanned",
        subjectId: unplan.blockId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcomes;
}
