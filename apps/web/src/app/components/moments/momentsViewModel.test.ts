import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockProject,
  Phase2MockTask,
} from "@/lib/types";
import {
  blockTimelineState,
  buildCloseVM,
  buildDaySynthesis,
  buildFlowVM,
  buildGreeting,
  buildMonthlyRollupDrafts,
  buildStartVM,
  deriveMonthOverMonthReadback,
  formatRollupCountsComparison,
  greetingPeriod,
  waitingOnAgingBucket,
} from "./momentsViewModel";

/** Pinned clock — no ambient Date.now anywhere in these tests. */
const NOW = new Date("2026-07-05T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function atTodayHour(hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeArea(
  overrides: Partial<Phase2MockArea> & { id: string },
): Phase2MockArea {
  return {
    user_id: "user-1",
    name: `Area ${overrides.id}`,
    color: "#000000",
    created_at: daysBefore(100),
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<Phase2MockTask> & { id: string; title: string },
): Phase2MockTask {
  return {
    user_id: "user-1",
    area_id: "area-1",
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: daysBefore(1),
    updated_at: daysBefore(1),
    ...overrides,
  } as Phase2MockTask;
}

function makeProject(
  overrides: Partial<Phase2MockProject> & { id: string; title: string },
): Phase2MockProject {
  return {
    user_id: "user-1",
    area_id: "area-1",
    description: null,
    status: "active",
    created_at: daysBefore(100),
    updated_at: daysBefore(1),
    ...overrides,
  } as Phase2MockProject;
}

function makeBlock(
  overrides: Partial<Phase2MockCalendarBlock> & { id: string },
): Phase2MockCalendarBlock {
  return {
    user_id: "user-1",
    area_id: "area-1",
    proposal_id: null,
    task_id: null,
    google_event_id: null,
    start_at: atTodayHour(9),
    end_at: atTodayHour(10),
    status: "scheduled",
    created_at: daysBefore(1),
    updated_at: daysBefore(1),
    ...overrides,
  } as Phase2MockCalendarBlock;
}

function makeSession(
  overrides: Partial<Phase2MockExecutionSession> & { id: string },
): Phase2MockExecutionSession {
  return {
    user_id: "user-1",
    area_id: "area-1",
    task_id: null,
    calendar_block_id: null,
    planned_minutes: null,
    actual_minutes: null,
    status: "running",
    outcome: "completed",
    ...overrides,
  };
}

function stateWith(partial: Partial<WorkflowState>): WorkflowState {
  return {
    ...createInitialWorkflowState(),
    areas: [makeArea({ id: "area-1" })],
    ...partial,
  };
}

describe("buildStartVM — schedule block mapping", () => {
  it("filters to today's non-cancelled blocks and maps done/now/upcoming states", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-done",
          status: "completed",
          start_at: atTodayHour(8),
          end_at: atTodayHour(9),
        }),
        makeBlock({
          id: "b-now",
          status: "scheduled",
          start_at: atTodayHour(11),
          end_at: atTodayHour(13),
        }),
        makeBlock({
          id: "b-upcoming",
          status: "scheduled",
          start_at: atTodayHour(14),
          end_at: atTodayHour(15),
        }),
        makeBlock({
          id: "b-cancelled",
          status: "cancelled",
          start_at: atTodayHour(16),
          end_at: atTodayHour(17),
        }),
        makeBlock({
          id: "b-yesterday",
          status: "scheduled",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });

    expect(vm.blocks.map((b) => b.id)).toEqual([
      "b-done",
      "b-now",
      "b-upcoming",
    ]);
    expect(vm.blocks.find((b) => b.id === "b-done")?.state).toBe("done");
    expect(vm.blocks.find((b) => b.id === "b-now")?.state).toBe("now");
    expect(vm.blocks.find((b) => b.id === "b-upcoming")?.state).toBe(
      "upcoming",
    );
    expect(vm.counts.todayBlocks).toBe(3);
  });

  it("treats status='running' as now regardless of the time window", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-running",
          status: "running",
          start_at: atTodayHour(20),
          end_at: atTodayHour(21),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.blocks[0].state).toBe("now");
  });

  it("uses the linked task title, falling back to 'Focus block'", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Write report" })],
      calendarBlocks: [
        makeBlock({
          id: "b1",
          task_id: "t1",
          start_at: atTodayHour(9),
          end_at: atTodayHour(10),
        }),
        makeBlock({
          id: "b2",
          task_id: null,
          start_at: atTodayHour(15),
          end_at: atTodayHour(16),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.blocks.find((b) => b.id === "b1")?.title).toBe("Write report");
    expect(vm.blocks.find((b) => b.id === "b2")?.title).toBe("Focus block");
  });

  it("sorts blocks by start time", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-late",
          start_at: atTodayHour(16),
          end_at: atTodayHour(17),
        }),
        makeBlock({
          id: "b-early",
          start_at: atTodayHour(8),
          end_at: atTodayHour(8, 30),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.blocks.map((b) => b.id)).toEqual(["b-early", "b-late"]);
  });
});

describe("blockTimelineState — D-5 (#483)", () => {
  it("returns 'done' once status is completed, even mid-window", () => {
    expect(
      blockTimelineState(
        {
          status: "completed",
          start_at: atTodayHour(9),
          end_at: atTodayHour(10),
        },
        new Date(atTodayHour(9, 30)),
      ),
    ).toBe("done");
  });

  it("returns 'now' when now falls inside [start_at, end_at)", () => {
    const block = {
      status: "scheduled" as const,
      start_at: atTodayHour(11),
      end_at: atTodayHour(13),
    };

    expect(blockTimelineState(block, NOW)).toBe("now");
  });

  it("treats the start instant as 'now' (inclusive lower bound)", () => {
    const block = {
      status: "scheduled" as const,
      start_at: atTodayHour(12),
      end_at: atTodayHour(13),
    };

    expect(blockTimelineState(block, NOW)).toBe("now");
  });

  it("treats the end instant as 'upcoming', not 'now' (exclusive upper bound)", () => {
    const block = {
      status: "scheduled" as const,
      start_at: atTodayHour(11),
      end_at: atTodayHour(12),
    };

    expect(blockTimelineState(block, NOW)).toBe("upcoming");
  });

  it("returns 'upcoming' before the window starts", () => {
    const block = {
      status: "scheduled" as const,
      start_at: atTodayHour(13),
      end_at: atTodayHour(14),
    };

    expect(blockTimelineState(block, NOW)).toBe("upcoming");
  });

  it("returns 'now' for status='running' regardless of the time window", () => {
    const block = {
      status: "running" as const,
      start_at: atTodayHour(20),
      end_at: atTodayHour(21),
    };

    expect(blockTimelineState(block, NOW)).toBe("now");
  });

  it("never returns 'free' — v0 has no gap-row synthesis", () => {
    const block = {
      status: "cancelled" as const,
      start_at: atTodayHour(9),
      end_at: atTodayHour(10),
    };

    expect(blockTimelineState(block, NOW)).not.toBe("free");
  });
});

describe("buildStartVM — firstMove precedence", () => {
  it("prefers the now-block's task over everything else", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-now",
          title: "Now task",
          status: "active",
          created_at: daysBefore(50),
        }),
        makeTask({
          id: "t-old",
          title: "Old task",
          status: "active",
          created_at: daysBefore(90),
        }),
      ],
      calendarBlocks: [
        makeBlock({
          id: "b-now",
          task_id: "t-now",
          start_at: atTodayHour(11),
          end_at: atTodayHour(13),
        }),
        makeBlock({
          id: "b-upcoming",
          start_at: atTodayHour(14),
          end_at: atTodayHour(15),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toMatchObject({
      title: "Now task",
      why: "Scheduled now",
      taskId: "t-now",
      estMinutes: 120,
    });
  });

  it("falls back to the next upcoming block's task when no now-block exists", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-up", title: "Upcoming task" })],
      calendarBlocks: [
        makeBlock({
          id: "b-upcoming",
          task_id: "t-up",
          start_at: atTodayHour(14),
          end_at: atTodayHour(14, 30),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toMatchObject({
      title: "Upcoming task",
      why: "Next on your schedule",
      taskId: "t-up",
      estMinutes: 30,
    });
  });

  it("falls back to the oldest active task when no blocks exist today", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-newer",
          title: "Newer",
          status: "active",
          created_at: daysBefore(2),
        }),
        makeTask({
          id: "t-oldest",
          title: "Oldest",
          status: "active",
          created_at: daysBefore(20),
        }),
        makeTask({
          id: "t-done",
          title: "Done",
          status: "done",
          created_at: daysBefore(100),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toMatchObject({
      title: "Oldest",
      why: "Oldest active commitment",
      taskId: "t-oldest",
      estMinutes: 25,
    });
  });

  it("scopes the oldest-active fallback to selectedAreaId when provided", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" }), makeArea({ id: "area-2" })],
      tasks: [
        makeTask({
          id: "t-a1",
          title: "Area1 task",
          area_id: "area-1",
          status: "active",
          created_at: daysBefore(50),
        }),
        makeTask({
          id: "t-a2",
          title: "Area2 older task",
          area_id: "area-2",
          status: "active",
          created_at: daysBefore(90),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW, selectedAreaId: "area-1" });
    expect(vm.firstMove?.taskId).toBe("t-a1");
  });

  it("falls back to all areas when selectedAreaId has no active tasks", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" }), makeArea({ id: "area-2" })],
      tasks: [
        makeTask({
          id: "t-a2",
          title: "Area2 task",
          area_id: "area-2",
          status: "active",
          created_at: daysBefore(10),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW, selectedAreaId: "area-1" });
    expect(vm.firstMove?.taskId).toBe("t-a2");
  });

  it("is null when there is no now/upcoming block and no active tasks", () => {
    const state = stateWith({});
    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toBeNull();
  });
});

describe("waitingOnAgingBucket", () => {
  // D-4 (#483): the pure age -> --state-* bucket ramp SideRail's waiting-on
  // row color/bar derives from. Boundaries mirror the "waiting-on
  // thresholds" describe block below exactly — this is the same rule,
  // exercised directly.
  it("buckets 0-2 days as ok", () => {
    expect(waitingOnAgingBucket(0)).toBe("ok");
    expect(waitingOnAgingBucket(1)).toBe("ok");
    expect(waitingOnAgingBucket(2)).toBe("ok");
  });

  it("buckets 3-6 days as watch", () => {
    expect(waitingOnAgingBucket(3)).toBe("watch");
    expect(waitingOnAgingBucket(6)).toBe("watch");
  });

  it("buckets 7+ days as risk, unbounded", () => {
    expect(waitingOnAgingBucket(7)).toBe("risk");
    expect(waitingOnAgingBucket(30)).toBe("risk");
  });
});

describe("buildStartVM — waiting-on thresholds", () => {
  it("classifies ok/watch/risk at the 2/3/7 day boundaries", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-ok",
          title: "Ok",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(2),
        }),
        makeTask({
          id: "t-watch-lo",
          title: "WatchLo",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(3),
        }),
        makeTask({
          id: "t-watch-hi",
          title: "WatchHi",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(6),
        }),
        makeTask({
          id: "t-risk",
          title: "Risk",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(7),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    const byId = Object.fromEntries(vm.waitingOn.map((w) => [w.taskId, w]));

    expect(byId["t-ok"]).toMatchObject({ daysWaiting: 2, status: "ok" });
    expect(byId["t-watch-lo"]).toMatchObject({
      daysWaiting: 3,
      status: "watch",
    });
    expect(byId["t-watch-hi"]).toMatchObject({
      daysWaiting: 6,
      status: "watch",
    });
    expect(byId["t-risk"]).toMatchObject({ daysWaiting: 7, status: "risk" });
  });

  it("excludes tasks without waiting_on_person_id and closed-status tasks", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-none", title: "None" }),
        makeTask({
          id: "t-done",
          title: "Done but waiting",
          status: "done",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(10),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.waitingOn).toEqual([]);
  });

  it("treats a null waiting_on_since as 0 days waiting", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-null-since",
          title: "NullSince",
          waiting_on_person_id: "p1",
          waiting_on_since: null,
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.waitingOn[0]).toMatchObject({
      daysWaiting: 0,
      status: "ok",
      since: null,
    });
  });
});

describe("buildStartVM — area health precedence", () => {
  it("marks an area idle when it has no open tasks and no today-blocks", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" })],
      tasks: [
        makeTask({
          id: "t1",
          title: "Done task",
          area_id: "area-1",
          status: "done",
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.areas[0].status).toBe("idle");
  });

  it("marks risk when any waiting entry in the area is risk, even with open tasks", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" })],
      tasks: [
        makeTask({
          id: "t1",
          title: "Open",
          area_id: "area-1",
          status: "active",
        }),
        makeTask({
          id: "t2",
          title: "Waiting risk",
          area_id: "area-1",
          status: "active",
          waiting_on_person_id: "p1",
          waiting_on_since: daysBefore(10),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.areas[0].status).toBe("risk");
  });

  it("marks watch for pending triage capture in the area, absent risk", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" })],
      tasks: [
        makeTask({
          id: "t1",
          title: "Open",
          area_id: "area-1",
          status: "active",
        }),
      ],
      captureItems: [
        {
          id: "c1",
          user_id: "user-1",
          area_id: "area-1",
          raw_text: "note",
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "triage_required",
          created_at: daysBefore(1),
        },
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.areas[0].status).toBe("watch");
  });

  it("marks ok when open tasks exist with no triage/waiting issues", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" })],
      tasks: [
        makeTask({
          id: "t1",
          title: "Open",
          area_id: "area-1",
          status: "active",
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.areas[0].status).toBe("ok");
    expect(vm.areas[0].note).toBe("1 open");
  });

  // D-11 (#483): area health carries the area's real identity color
  // straight from Phase2MockArea.color — not a fabricated per-status hue.
  it("carries the area's real color through, unchanged from Phase2MockArea", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1", color: "#9333ea" })],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.areas[0].color).toBe("#9333ea");
  });
});

describe("buildFlowVM", () => {
  it("maps the now-block to currentBlock", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Focus task" })],
      calendarBlocks: [
        makeBlock({
          id: "b1",
          task_id: "t1",
          start_at: atTodayHour(11),
          end_at: atTodayHour(13),
        }),
      ],
    });

    const vm = buildFlowVM(state, { now: NOW });
    expect(vm.currentBlock).toMatchObject({ title: "Focus task" });
  });

  it("is null with no in-progress block", () => {
    const state = stateWith({});
    const vm = buildFlowVM(state, { now: NOW });
    expect(vm.currentBlock).toBeNull();
  });

  it("surfaces drift with 0 minutes when the latest session is stuck/missed/distracted", () => {
    const state = stateWith({
      executionSessions: [makeSession({ id: "s1", status: "stuck" })],
    });

    const vm = buildFlowVM(state, { now: NOW });
    expect(vm.drift).toEqual({ minutes: 0, reason: "stuck" });
  });

  it("has no drift when the latest session is healthy", () => {
    const state = stateWith({
      executionSessions: [makeSession({ id: "s1", status: "running" })],
    });

    const vm = buildFlowVM(state, { now: NOW });
    expect(vm.drift).toBeNull();
  });
});

describe("buildCloseVM", () => {
  it("counts today's completed/missed blocks", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({ id: "b-done1", status: "completed" }),
        makeBlock({ id: "b-done2", status: "completed" }),
        makeBlock({ id: "b-missed", status: "missed" }),
        makeBlock({
          id: "b-yesterday",
          status: "completed",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
        }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.completedToday).toBe(2);
    expect(vm.missedToday).toBe(1);
  });

  it("carries forward active/scheduled tasks linked to missed blocks, deduped", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t1", title: "Carry me", status: "active" }),
        makeTask({ id: "t2", title: "Done already", status: "done" }),
      ],
      calendarBlocks: [
        makeBlock({ id: "b-missed1", task_id: "t1", status: "missed" }),
        makeBlock({ id: "b-missed2", task_id: "t1", status: "missed" }),
        makeBlock({ id: "b-missed3", task_id: "t2", status: "missed" }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.carryForward).toEqual([{ taskId: "t1", title: "Carry me" }]);
  });

  it("derives tomorrowFirstMove via the oldest-active rule", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-newer",
          title: "Newer",
          status: "active",
          created_at: daysBefore(2),
        }),
        makeTask({
          id: "t-oldest",
          title: "Oldest",
          status: "active",
          created_at: daysBefore(20),
        }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.tomorrowFirstMove).toMatchObject({
      taskId: "t-oldest",
      why: "Oldest active commitment",
    });
  });

  it("surfaces today's completed-task blocks as win candidates, deduped by task", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-win", title: "Shipped onboarding" })],
      calendarBlocks: [
        makeBlock({ id: "b-w1", task_id: "t-win", status: "completed" }),
        makeBlock({ id: "b-w2", task_id: "t-win", status: "completed" }),
        makeBlock({ id: "b-missed", task_id: "t-win", status: "missed" }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.winCandidates).toHaveLength(1);
    expect(vm.winCandidates[0]).toMatchObject({
      taskId: "t-win",
      title: "Shipped onboarding",
    });
    expect(typeof vm.winCandidates[0].areaLabel).toBe("string");
  });

  it("has no win candidates when nothing was completed today", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Open task", status: "active" })],
      calendarBlocks: [
        makeBlock({ id: "b-missed", task_id: "t1", status: "missed" }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.winCandidates).toEqual([]);
  });

  it("composes a per-area weekly rollup draft from the last 7 days", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-done", title: "Shipped onboarding" }),
        makeTask({ id: "t-miss", title: "Skipped review", status: "active" }),
      ],
      calendarBlocks: [
        makeBlock({ id: "b-done", task_id: "t-done", status: "completed" }),
        makeBlock({
          id: "b-miss",
          task_id: "t-miss",
          status: "missed",
          start_at: daysBefore(2),
          end_at: daysBefore(2),
        }),
        // Outside the 7-day window -> excluded.
        makeBlock({
          id: "b-old",
          task_id: "t-done",
          status: "completed",
          start_at: daysBefore(30),
          end_at: daysBefore(30),
        }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.rollupDrafts).toHaveLength(1);
    const draft = vm.rollupDrafts[0];
    expect(draft.summary.highlights).toEqual(["Shipped onboarding"]);
    expect(draft.summary.misses).toEqual(["Skipped review"]);
    expect(draft.summary.counts).toEqual({
      wins: 1,
      completed_sessions: 1,
      missed_sessions: 1,
    });
    expect(draft.periodStart <= draft.periodEnd).toBe(true);
  });

  it("has no rollup drafts when no completed/missed blocks fall in the week", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Open", status: "active" })],
      calendarBlocks: [
        makeBlock({ id: "b-sched", task_id: "t1", status: "scheduled" }),
      ],
    });

    const vm = buildCloseVM(state, { now: NOW });
    expect(vm.rollupDrafts).toEqual([]);
  });
});

/**
 * #486 (monthly rollup surface, S8 follow-up) — pure composition over
 * caller-supplied approved-weekly-rollup input (not `state`), mirroring
 * `buildWeeklyRollupDrafts`'s per-area/deterministic shape. `NOW` is pinned
 * to 2026-07-05, so the current month is July 2026 (period_start
 * "2026-07-01") and the prior month is June 2026 ("2026-06-01").
 */
describe("buildMonthlyRollupDrafts (#486)", () => {
  it("composes a per-area monthly draft from that area's approved weekly rollups this month", () => {
    const drafts = buildMonthlyRollupDrafts(
      [
        {
          areaId: "area-1",
          areaLabel: "Main Job",
          periodStart: "2026-07-01",
          summary: {
            highlights: ["Shipped onboarding"],
            misses: ["Deep-work morning"],
            counts: { wins: 1, completed_sessions: 4, missed_sessions: 1 },
          },
        },
        {
          areaId: "area-1",
          areaLabel: "Main Job",
          periodStart: "2026-07-05",
          summary: {
            highlights: ["Launched pricing"],
            misses: [],
            counts: { wins: 1, completed_sessions: 6, missed_sessions: 0 },
          },
        },
      ],
      NOW,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      areaId: "area-1",
      areaLabel: "Main Job",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-05",
      weeksComposed: 2,
    });
    expect(drafts[0].summary.highlights).toEqual([
      "Shipped onboarding",
      "Launched pricing",
    ]);
    expect(drafts[0].summary.counts).toEqual({
      wins: 2,
      completed_sessions: 10,
      missed_sessions: 1,
    });
  });

  it("excludes a weekly rollup approved before the current month started", () => {
    const drafts = buildMonthlyRollupDrafts(
      [
        {
          areaId: "area-1",
          areaLabel: "Main Job",
          periodStart: "2026-06-24",
          summary: {
            highlights: ["Old week"],
            misses: [],
            counts: { wins: 1 },
          },
        },
      ],
      NOW,
    );

    expect(drafts).toEqual([]);
  });

  it("keeps areas independent — one draft per area", () => {
    const drafts = buildMonthlyRollupDrafts(
      [
        {
          areaId: "area-1",
          areaLabel: "Main Job",
          periodStart: "2026-07-01",
          summary: { highlights: [], misses: [], counts: { wins: 1 } },
        },
        {
          areaId: "area-2",
          areaLabel: "Personal",
          periodStart: "2026-07-01",
          summary: { highlights: [], misses: [], counts: { wins: 2 } },
        },
      ],
      NOW,
    );

    expect(drafts.map((d) => d.areaId)).toEqual(["area-1", "area-2"]);
  });
});

describe("deriveMonthOverMonthReadback (#486)", () => {
  it("returns the prior month's row for an area that has one", () => {
    const readback = deriveMonthOverMonthReadback(
      [
        {
          areaId: "area-1",
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          summary: { highlights: [], misses: [], counts: { wins: 3 } },
        },
      ],
      NOW,
    );

    expect(readback).toEqual([
      {
        areaId: "area-1",
        periodLabel: "2026-06-01 – 2026-06-30",
        counts: { wins: 3 },
      },
    ]);
  });

  it("never fabricates a comparison when no prior-month row exists", () => {
    const readback = deriveMonthOverMonthReadback(
      [
        {
          areaId: "area-1",
          // Two months back, not the immediately-prior month.
          periodStart: "2026-05-01",
          periodEnd: "2026-05-31",
          summary: { highlights: [], misses: [], counts: { wins: 3 } },
        },
      ],
      NOW,
    );

    expect(readback).toEqual([]);
  });
});

describe("formatRollupCountsComparison (#486)", () => {
  it("formats a signed delta per count key, sorted", () => {
    const text = formatRollupCountsComparison(
      { wins: 2, completed_sessions: 10 },
      { wins: 1 },
    );
    expect(text).toBe(
      "completed sessions: 10 (+10 vs last month) · wins: 2 (+1 vs last month)",
    );
  });

  it("shows a zero/negative delta truthfully", () => {
    const text = formatRollupCountsComparison({ wins: 1 }, { wins: 3 });
    expect(text).toBe("wins: 1 (-2 vs last month)");
  });
});

/**
 * S5 (#257) — calendar-load-aware daily focus. `dailyFocusBudget.test.ts`
 * unit-tests the pure rule (thresholds/degraded/split) directly; these
 * tests cover the momentsViewModel integration: budget/degraded exposed on
 * StartVM, and the focus/deferred item split wired to real state. Fixture
 * blocks here use *local* hours (matching `deriveFreeHoursFromBlocks`'s
 * 08:00-18:00 local working window) rather than this file's existing
 * `atTodayHour` (UTC), so free-hour math is unambiguous regardless of the
 * test runner's timezone.
 */
function atLocalHour(hour: number, minute = 0): string {
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("buildStartVM — S5 focus budget (#257)", () => {
  it("empty calendar -> budget 3, not degraded", () => {
    const vm = buildStartVM(stateWith({}), { now: NOW });
    expect(vm.focusBudget).toBe(3);
    expect(vm.focusDegraded).toBe(false);
  });

  it("moderate day (7 busy hours, 3 free hours) -> budget 2", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b1",
          start_at: atLocalHour(8),
          end_at: atLocalHour(10),
        }),
        makeBlock({
          id: "b2",
          start_at: atLocalHour(10),
          end_at: atLocalHour(13),
        }),
        makeBlock({
          id: "b3",
          start_at: atLocalHour(15),
          end_at: atLocalHour(17),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.focusBudget).toBe(2);
    expect(vm.focusDegraded).toBe(false);
  });

  it("packed day (9 busy hours, 1 free hour) -> budget 1", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b1",
          start_at: atLocalHour(8),
          end_at: atLocalHour(12),
        }),
        makeBlock({
          id: "b2",
          start_at: atLocalHour(12),
          end_at: atLocalHour(17),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.focusBudget).toBe(1);
    expect(vm.focusDegraded).toBe(false);
  });

  it("degraded: calendarUnavailable -> DEFAULT_FOCUS_BUDGET and focusDegraded true", () => {
    const vm = buildStartVM(stateWith({}), {
      now: NOW,
      calendarUnavailable: true,
    });
    expect(vm.focusDegraded).toBe(true);
    expect(vm.focusBudget).toBe(2); // DEFAULT_FOCUS_BUDGET
  });

  it("focusItems[0] equals firstMove when firstMove is a task", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t-oldest",
          title: "Oldest",
          status: "active",
          created_at: daysBefore(20),
        }),
        makeTask({
          id: "t-newer",
          title: "Newer",
          status: "active",
          created_at: daysBefore(2),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).not.toBeNull();
    expect(vm.focusItems[0]).toEqual(vm.firstMove);
    expect(vm.focusItems.map((item) => item.taskId)).toEqual([
      "t-oldest",
      "t-newer",
    ]);
  });

  it("focusItems[0] equals firstMove when firstMove comes from a now-block (task or not)", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-now", title: "Now task", status: "active" })],
      calendarBlocks: [
        makeBlock({
          id: "b-now",
          task_id: "t-now",
          start_at: atTodayHour(11),
          end_at: atTodayHour(13),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toMatchObject({ why: "Scheduled now" });
    expect(vm.focusItems[0]).toEqual(vm.firstMove);
  });

  it("firstMove from a now-block with no linked task still heads focusItems, without duplicating any task", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-a", title: "Task A", status: "active" }),
        makeTask({ id: "t-b", title: "Task B", status: "active" }),
      ],
      calendarBlocks: [
        makeBlock({
          id: "b-now",
          task_id: null,
          start_at: atTodayHour(11),
          end_at: atTodayHour(13),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.firstMove).toMatchObject({ why: "Scheduled now", taskId: null });
    expect(vm.focusItems[0]).toEqual(vm.firstMove);
    // Both active tasks remain in the list once each (no dedup collision
    // against a null taskId).
    expect(vm.focusItems.map((item) => item.taskId)).toEqual([
      null,
      "t-a",
      "t-b",
    ]);
  });

  it("splits focusItems/deferredItems at the budget, preserving the deferred tail", () => {
    const state = stateWith({
      tasks: [
        makeTask({
          id: "t1",
          title: "T1",
          status: "active",
          created_at: daysBefore(40),
        }),
        makeTask({
          id: "t2",
          title: "T2",
          status: "active",
          created_at: daysBefore(30),
        }),
        makeTask({
          id: "t3",
          title: "T3",
          status: "active",
          created_at: daysBefore(20),
        }),
        makeTask({
          id: "t4",
          title: "T4",
          status: "active",
          created_at: daysBefore(10),
        }),
      ],
      // Packed day (1 free hour) -> budget 1. Marked "completed" so neither block is
      // picked up as firstMove (this fixture is isolated to the
      // focus/deferred split, not firstMove-from-block precedence, which
      // is covered separately above).
      calendarBlocks: [
        makeBlock({
          id: "b1",
          status: "completed",
          start_at: atLocalHour(8),
          end_at: atLocalHour(12),
        }),
        makeBlock({
          id: "b2",
          status: "completed",
          start_at: atLocalHour(12),
          end_at: atLocalHour(17),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.focusBudget).toBe(1);
    expect(vm.focusItems.map((item) => item.taskId)).toEqual(["t1"]);
    expect(vm.deferredItems.map((item) => item.taskId)).toEqual([
      "t2",
      "t3",
      "t4",
    ]);
  });

  it("deferredItems is empty when the ranked list is within budget", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Only task", status: "active" })],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.focusBudget).toBe(3);
    expect(vm.focusItems.map((item) => item.taskId)).toEqual(["t1"]);
    expect(vm.deferredItems).toEqual([]);
  });
});

describe("buildStartVM — S6 stale project (#258)", () => {
  it("null when no project exceeds the 7-day threshold", () => {
    const state = stateWith({
      projects: [
        makeProject({ id: "p1", title: "Fresh", updated_at: daysBefore(2) }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toBeNull();
  });

  it("null when projects list is empty (degraded/empty case, not an error)", () => {
    const vm = buildStartVM(stateWith({}), { now: NOW });
    expect(vm.staleProject).toBeNull();
  });

  it("an active project older than 7 days (by updated_at) surfaces with a floored ageDays", () => {
    const state = stateWith({
      projects: [
        makeProject({
          id: "p1",
          title: "Stale project",
          updated_at: daysBefore(10),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toEqual({
      id: "p1",
      name: "Stale project",
      ageDays: 10,
    });
  });

  it("exactly 7 days old is NOT yet stale (strict greater-than)", () => {
    const state = stateWith({
      projects: [
        makeProject({
          id: "p1",
          title: "Borderline",
          updated_at: daysBefore(7),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toBeNull();
  });

  it("picks the single stalest among multiple qualifying projects", () => {
    const state = stateWith({
      projects: [
        makeProject({
          id: "p-medium",
          title: "Medium stale",
          updated_at: daysBefore(9),
        }),
        makeProject({
          id: "p-stalest",
          title: "Stalest",
          updated_at: daysBefore(30),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toMatchObject({ id: "p-stalest", ageDays: 30 });
  });

  it("excludes non-active (paused/done/dropped/archived) projects even if old", () => {
    const state = stateWith({
      projects: [
        makeProject({
          id: "p-done",
          title: "Finished long ago",
          status: "done",
          updated_at: daysBefore(365),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toBeNull();
  });

  it("a linked task's more-recent updated_at counts as project activity (project not stale)", () => {
    const state = stateWith({
      projects: [
        makeProject({
          id: "p1",
          title: "Actually active",
          updated_at: daysBefore(30),
        }),
      ],
      tasks: [
        makeTask({
          id: "t1",
          title: "Recent task",
          project_id: "p1",
          updated_at: daysBefore(1),
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject).toBeNull();
  });

  it("ties break deterministically by id ascending", () => {
    const state = stateWith({
      projects: [
        makeProject({ id: "p-b", title: "B", updated_at: daysBefore(10) }),
        makeProject({ id: "p-a", title: "A", updated_at: daysBefore(10) }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.staleProject?.id).toBe("p-a");
  });
});

describe("buildStartVM — S6 recovery nudge (#258)", () => {
  it("null when there is no calendar data at all", () => {
    const vm = buildStartVM(stateWith({}), { now: NOW });
    expect(vm.recoveryNudge).toBeNull();
  });

  it("null when yesterday had no missed block", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-yesterday-done",
          status: "completed",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
          task_id: "t1",
        }),
      ],
      tasks: [makeTask({ id: "t1", title: "Done yesterday" })],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.recoveryNudge).toBeNull();
  });

  it("null when the missed block is from today, not yesterday (buildCloseVM's own scope)", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-today-missed",
          status: "missed",
          start_at: atTodayHour(8),
          end_at: atTodayHour(9),
          task_id: "t1",
        }),
      ],
      tasks: [makeTask({ id: "t1", title: "Missed today" })],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.recoveryNudge).toBeNull();
  });

  it("null when yesterday's missed block has no linked task_id (mirrors buildCloseVM's skip rule)", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-yesterday-missed-notask",
          status: "missed",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
          task_id: null,
        }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.recoveryNudge).toBeNull();
  });

  it("surfaces a plain-language nudge for yesterday's missed block with a task, never mutating", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-yesterday-missed",
          status: "missed",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
          task_id: "t1",
        }),
      ],
      tasks: [makeTask({ id: "t1", title: "Draft the proposal" })],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.recoveryNudge).toEqual({
      blockTitle: "Draft the proposal",
      taskId: "t1",
    });
    // Surfaced only — the task/block status in state is untouched.
    expect(
      state.calendarBlocks.find((b) => b.id === "b-yesterday-missed")?.status,
    ).toBe("missed");
  });

  it("picks the earliest of multiple qualifying missed blocks from yesterday", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "b-later",
          status: "missed",
          start_at: new Date(
            new Date(daysBefore(1)).getTime() + 3 * 60 * 60 * 1000,
          ).toISOString(),
          end_at: new Date(
            new Date(daysBefore(1)).getTime() + 4 * 60 * 60 * 1000,
          ).toISOString(),
          task_id: "t-later",
        }),
        makeBlock({
          id: "b-earlier",
          status: "missed",
          start_at: daysBefore(1),
          end_at: daysBefore(1),
          task_id: "t-earlier",
        }),
      ],
      tasks: [
        makeTask({ id: "t-later", title: "Later task" }),
        makeTask({ id: "t-earlier", title: "Earlier task" }),
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.recoveryNudge?.taskId).toBe("t-earlier");
  });
});

// D-2 (design alignment, #483) — start-moment hero: deterministic greeting
// + day-synthesis sentence. `now.getHours()` reads local time (same idiom
// as `TodayMoments`' `heuristicMoment`), so these use the local `Date`
// constructor rather than a UTC ISO string to stay TZ-independent.
describe("greetingPeriod / buildGreeting — D-2 (#483)", () => {
  it("returns morning for hours [0, 12)", () => {
    expect(greetingPeriod(new Date(2026, 6, 5, 0, 0))).toBe("morning");
    expect(greetingPeriod(new Date(2026, 6, 5, 11, 59))).toBe("morning");
  });

  it("returns afternoon for hours [12, 17)", () => {
    expect(greetingPeriod(new Date(2026, 6, 5, 12, 0))).toBe("afternoon");
    expect(greetingPeriod(new Date(2026, 6, 5, 16, 59))).toBe("afternoon");
  });

  it("returns evening for hours [17, 24)", () => {
    expect(greetingPeriod(new Date(2026, 6, 5, 17, 0))).toBe("evening");
    expect(greetingPeriod(new Date(2026, 6, 5, 23, 59))).toBe("evening");
  });

  it("renders the time-of-day greeting alone when no name is given", () => {
    expect(buildGreeting(new Date(2026, 6, 5, 9, 0))).toBe("Good morning.");
    expect(buildGreeting(new Date(2026, 6, 5, 9, 0), null)).toBe(
      "Good morning.",
    );
    expect(buildGreeting(new Date(2026, 6, 5, 9, 0), "")).toBe("Good morning.");
    expect(buildGreeting(new Date(2026, 6, 5, 9, 0), "   ")).toBe(
      "Good morning.",
    );
  });

  it("appends the trimmed name when given", () => {
    expect(buildGreeting(new Date(2026, 6, 5, 14, 0), "  Jay  ")).toBe(
      "Good afternoon, Jay.",
    );
    expect(buildGreeting(new Date(2026, 6, 5, 20, 0), "Jay")).toBe(
      "Good evening, Jay.",
    );
  });
});

describe("buildDaySynthesis — D-2 (#483)", () => {
  it("returns the truthful empty-day sentence when nothing is scheduled or queued", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 0,
        focusFilledCount: 0,
        focusBudget: 2,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("Nothing on the calendar, and nothing queued yet.");
  });

  it("R2-B (#483 round 2): the empty-day sentence states the fact only — no capture call-to-action (the hero card owns that)", () => {
    const sentence = buildDaySynthesis({
      todayBlockCount: 0,
      focusFilledCount: 0,
      focusBudget: 2,
      deferredCount: 0,
      pendingTriageCount: 0,
    });
    expect(sentence).not.toContain("capture");
    expect(sentence).not.toContain("Capture");
  });

  it("singularizes 1 block and 1 focus slot", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 1,
        focusFilledCount: 1,
        focusBudget: 1,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("1 block on the calendar today — 1 of 1 focus slot filled.");
  });

  it("pluralizes N blocks and N focus slots with no deferred suffix", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 3,
        focusFilledCount: 2,
        focusBudget: 3,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("3 blocks on the calendar today — 2 of 3 focus slots filled.");
  });

  it("reads 'No blocks' when blocks are 0 but focus items exist", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 0,
        focusFilledCount: 2,
        focusBudget: 2,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("No blocks on the calendar today — 2 of 2 focus slots filled.");
  });

  it("reads 'nothing queued for focus' when focusFilledCount is 0 but blocks exist", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 2,
        focusFilledCount: 0,
        focusBudget: 2,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("2 blocks on the calendar today — nothing queued for focus.");
  });

  it("appends the deferred-count suffix — never hidden — when deferredCount > 0", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 4,
        focusFilledCount: 1,
        focusBudget: 1,
        deferredCount: 3,
        pendingTriageCount: 0,
      }),
    ).toBe(
      "4 blocks on the calendar today — 1 of 1 focus slot filled (3 deferred).",
    );
  });

  it("#551: pendingTriageCount 0 leaves every sentence unchanged", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 0,
        focusFilledCount: 0,
        focusBudget: 3,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("Nothing on the calendar, and nothing queued yet.");
    expect(
      buildDaySynthesis({
        todayBlockCount: 2,
        focusFilledCount: 1,
        focusBudget: 3,
        deferredCount: 0,
        pendingTriageCount: 0,
      }),
    ).toBe("2 blocks on the calendar today — 1 of 3 focus slots filled.");
  });

  it("#551: an otherwise-empty day with 1 pending draft never claims 'nothing queued' (singular)", () => {
    const sentence = buildDaySynthesis({
      todayBlockCount: 0,
      focusFilledCount: 0,
      focusBudget: 3,
      deferredCount: 0,
      pendingTriageCount: 1,
    });
    expect(sentence).toBe(
      "Nothing on the calendar yet — 1 thought waiting for a decision.",
    );
    expect(sentence).not.toContain("nothing queued");
  });

  it("#551: pending drafts with blocks present append a second plural sentence", () => {
    expect(
      buildDaySynthesis({
        todayBlockCount: 2,
        focusFilledCount: 1,
        focusBudget: 3,
        deferredCount: 0,
        pendingTriageCount: 3,
      }),
    ).toBe(
      "2 blocks on the calendar today — 1 of 3 focus slots filled. 3 thoughts waiting for a decision.",
    );
  });
});

describe("buildStartVM — D-2 hero wiring (#483)", () => {
  it("wires greeting from `now` with no name by default", () => {
    const state = stateWith({});
    const vm = buildStartVM(state, { now: new Date(2026, 6, 5, 9, 0) });
    expect(vm.greeting).toBe("Good morning.");
  });

  it("wires greeting with an injected userName", () => {
    const state = stateWith({});
    const vm = buildStartVM(state, {
      now: new Date(2026, 6, 5, 9, 0),
      userName: "Jay",
    });
    expect(vm.greeting).toBe("Good morning, Jay.");
  });

  it("wires daySynthesis from the same counts already on StartVM", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1", title: "Write report" })],
    });
    const vm = buildStartVM(state, { now: NOW });
    expect(vm.daySynthesis).toBe(
      buildDaySynthesis({
        todayBlockCount: vm.blocks.length,
        focusFilledCount: vm.focusItems.length,
        focusBudget: vm.focusBudget,
        deferredCount: vm.deferredItems.length,
        pendingTriageCount: vm.counts.pendingTriage,
      }),
    );
  });
});

describe("buildStartVM — D-8 topPendingTriageItem (#483)", () => {
  it("is null when nothing is pending triage", () => {
    const state = stateWith({});
    const vm = buildStartVM(state, { now: NOW });
    expect(vm.topPendingTriageItem).toBeNull();
  });

  it("picks the oldest pending-triage capture (created_at ascending)", () => {
    const state = stateWith({
      captureItems: [
        {
          id: "c-newer",
          user_id: "user-1",
          area_id: "area-1",
          raw_text: "Newer capture",
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "new",
          created_at: daysBefore(1),
        },
        {
          id: "c-older",
          user_id: "user-1",
          area_id: "area-1",
          raw_text: "Older capture, waiting longest",
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "triage_required",
          created_at: daysBefore(5),
        },
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.topPendingTriageItem).toEqual({
      id: "c-older",
      summary: "Older capture, waiting longest",
      areaLabel: "Area area-1",
    });
  });

  it("ignores resolved/archived/parsed captures", () => {
    const state = stateWith({
      captureItems: [
        {
          id: "c-done",
          user_id: "user-1",
          area_id: "area-1",
          raw_text: "Already resolved",
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "resolved",
          created_at: daysBefore(10),
        },
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.topPendingTriageItem).toBeNull();
  });

  it("truncates a long raw_text summary rather than rendering it in full", () => {
    const longText = "x".repeat(200);
    const state = stateWith({
      captureItems: [
        {
          id: "c1",
          user_id: "user-1",
          area_id: "area-1",
          raw_text: longText,
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "new",
          created_at: daysBefore(1),
        },
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.topPendingTriageItem?.summary.length).toBeLessThan(
      longText.length,
    );
    expect(vm.topPendingTriageItem?.summary.endsWith("…")).toBe(true);
  });

  it("resolves an empty areaLabel when the capture has no area_id", () => {
    const state = stateWith({
      captureItems: [
        {
          id: "c1",
          user_id: "user-1",
          area_id: null,
          raw_text: "No area",
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "new",
          created_at: daysBefore(1),
        },
      ],
    });

    const vm = buildStartVM(state, { now: NOW });
    expect(vm.topPendingTriageItem?.areaLabel).toBe("");
  });
});

// R3-A's `dayIsEmpty` flag (its own describe block used to live here) was
// removed in R4-A (#483 round 4): its only consumer was `LoopOrientation`'s
// gate in StartMoment.tsx, and that component is gone — its ratified content
// now lives inside PipelineOverview as an empty-pipeline state driven
// directly by `pipelineCounts`, not by this broader day-level signal. See
// PipelineOverview.tsx's R4-A doc comment and PipelineOverview.test.tsx's
// "explain mode" coverage for the replacement behaviour/tests. The
// `buildDaySynthesis` "genuinely nothing" sentence itself is unchanged and
// still covered above.
