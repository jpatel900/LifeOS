import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import { buildCloseVM, buildFlowVM, buildStartVM } from "./momentsViewModel";

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
});
