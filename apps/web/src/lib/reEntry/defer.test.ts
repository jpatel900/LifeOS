import { describe, expect, it, vi } from "vitest";
import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import type { Phase2MockCalendarBlock } from "@/lib/types";
import { executeReEntryDeferrals, planReEntryDeferrals } from "./defer";
import type { LapsedBlockSummary } from "./summary";

/**
 * FR-028 packet F-G2b: the deterministic defer rule and its fault-isolated
 * executor. Pure planner tests + executor tests with injected deps — no
 * network, no ambient clock.
 */

const NOW = new Date("2026-07-05T12:00:00.000Z");

function lapsed(
  overrides: Partial<LapsedBlockSummary> & { blockId: string },
): LapsedBlockSummary {
  return {
    taskId: null,
    areaId: "area-uuid",
    taskTitle: null,
    endAt: "2026-07-03T10:00:00.000Z",
    googleEventId: null,
    ...overrides,
  };
}

function block(
  overrides: Partial<Phase2MockCalendarBlock> & { id: string },
): Phase2MockCalendarBlock {
  return {
    user_id: "user-1",
    area_id: "area-uuid",
    proposal_id: null,
    task_id: null,
    google_event_id: null,
    start_at: "2026-07-03T09:00:00.000Z",
    end_at: "2026-07-03T10:00:00.000Z",
    status: "scheduled",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as Phase2MockCalendarBlock;
}

describe("planReEntryDeferrals", () => {
  it("routes google-backed lapsed blocks to requiresApproval, never auto-defer", () => {
    const plan = planReEntryDeferrals({
      lapsedBlocks: [
        lapsed({ blockId: "b1", googleEventId: "lifeos-abc", taskId: "t1" }),
      ],
      allBlocks: [
        block({ id: "b1", task_id: "t1", google_event_id: "lifeos-abc" }),
      ],
    });

    expect(plan.taskDeferrals).toEqual([]);
    expect(plan.blockUnplans).toEqual([]);
    expect(plan.requiresApproval).toEqual([
      { blockId: "b1", taskId: "t1", reason: "google_backed_block" },
    ]);
  });

  it("defers the whole task to backlog when every upcoming block lapsed", () => {
    const plan = planReEntryDeferrals({
      lapsedBlocks: [
        lapsed({ blockId: "b1", taskId: "t1", taskTitle: "Write report" }),
        lapsed({
          blockId: "b2",
          taskId: "t1",
          taskTitle: "Write report",
          endAt: "2026-07-04T10:00:00.000Z",
        }),
      ],
      allBlocks: [
        block({ id: "b1", task_id: "t1" }),
        block({ id: "b2", task_id: "t1" }),
        block({ id: "b-other-task", task_id: "t2" }),
      ],
    });

    expect(plan.taskDeferrals).toHaveLength(1);
    expect(plan.taskDeferrals[0]).toMatchObject({
      taskId: "t1",
      blockIds: ["b1", "b2"],
    });
    expect(plan.blockUnplans).toEqual([]);
    expect(plan.requiresApproval).toEqual([]);
  });

  it("unplans only the lapsed block when the task still has a future block", () => {
    const plan = planReEntryDeferrals({
      lapsedBlocks: [lapsed({ blockId: "b-lapsed", taskId: "t1" })],
      allBlocks: [
        block({ id: "b-lapsed", task_id: "t1" }),
        block({ id: "b-future", task_id: "t1" }),
      ],
    });

    expect(plan.taskDeferrals).toEqual([]);
    expect(plan.blockUnplans).toHaveLength(1);
    expect(plan.blockUnplans[0]).toMatchObject({
      blockId: "b-lapsed",
      taskId: "t1",
    });
  });

  it("keeps hands off a task with any google-backed upcoming block", () => {
    const plan = planReEntryDeferrals({
      lapsedBlocks: [lapsed({ blockId: "b-lapsed", taskId: "t1" })],
      allBlocks: [
        block({ id: "b-lapsed", task_id: "t1" }),
        block({ id: "b-google", task_id: "t1", google_event_id: "lifeos-x" }),
      ],
    });

    expect(plan.taskDeferrals).toEqual([]);
    expect(plan.blockUnplans).toEqual([]);
    expect(plan.requiresApproval).toEqual([
      {
        blockId: "b-lapsed",
        taskId: "t1",
        reason: "task_has_google_backed_block",
      },
    ]);
  });

  it("unplans a task-less lapsed block", () => {
    const plan = planReEntryDeferrals({
      lapsedBlocks: [lapsed({ blockId: "b-lone" })],
      allBlocks: [block({ id: "b-lone" })],
    });

    expect(plan.blockUnplans).toHaveLength(1);
    expect(plan.blockUnplans[0]).toMatchObject({ blockId: "b-lone" });
  });
});

describe("executeReEntryDeferrals", () => {
  const client = {} as MinimalSupabaseClient;

  it("applies transitions, records each deferral, and reports outcomes", async () => {
    const applyTaskReviewTransition = vi.fn().mockResolvedValue({});
    const unplanCalendarBlock = vi.fn().mockResolvedValue({});
    const recordReEntryDeferral = vi.fn();

    const plan = planReEntryDeferrals({
      lapsedBlocks: [
        lapsed({ blockId: "b1", taskId: "t1", taskTitle: "Write report" }),
        lapsed({ blockId: "b-lone" }),
      ],
      allBlocks: [block({ id: "b1", task_id: "t1" }), block({ id: "b-lone" })],
    });

    const outcomes = await executeReEntryDeferrals({
      client,
      plan,
      absenceDays: 5,
      now: NOW,
      deps: {
        applyTaskReviewTransition,
        unplanCalendarBlock,
        recordReEntryDeferral,
      },
    });

    expect(applyTaskReviewTransition).toHaveBeenCalledWith(
      client,
      "t1",
      "backlog",
    );
    expect(unplanCalendarBlock).toHaveBeenCalledWith(client, "b-lone");
    expect(recordReEntryDeferral).toHaveBeenCalledTimes(2);
    expect(recordReEntryDeferral).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        subject_type: "task",
        subject_id: "t1",
        action: "task_to_backlog",
        absence_days: 5,
        resolved_at: NOW.toISOString(),
      }),
    );
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });

  it("isolates a failed transition and skips its record", async () => {
    const applyTaskReviewTransition = vi
      .fn()
      .mockRejectedValue(new Error("boom"));
    const unplanCalendarBlock = vi.fn().mockResolvedValue({});
    const recordReEntryDeferral = vi.fn();

    const plan = planReEntryDeferrals({
      lapsedBlocks: [
        lapsed({ blockId: "b1", taskId: "t1" }),
        lapsed({ blockId: "b-lone" }),
      ],
      allBlocks: [block({ id: "b1", task_id: "t1" }), block({ id: "b-lone" })],
    });

    const outcomes = await executeReEntryDeferrals({
      client,
      plan,
      absenceDays: 3,
      now: NOW,
      deps: {
        applyTaskReviewTransition,
        unplanCalendarBlock,
        recordReEntryDeferral,
      },
    });

    expect(outcomes).toEqual([
      {
        kind: "task_to_backlog",
        subjectId: "t1",
        ok: false,
        error: "boom",
      },
      { kind: "block_unplanned", subjectId: "b-lone", ok: true, error: null },
    ]);
    // The failed task deferral records nothing; the successful unplan records once.
    expect(recordReEntryDeferral).toHaveBeenCalledTimes(1);
    expect(recordReEntryDeferral).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ subject_type: "calendar_block" }),
    );
  });
});
