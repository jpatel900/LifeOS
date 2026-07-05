import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import { buildProgressionNodes } from "./progressionNodes";

/** Pinned clock convention shared with momentsViewModel.test.ts. */
const NOW = new Date("2026-07-05T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
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
    start_at: daysBefore(0),
    end_at: daysBefore(0),
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
    outcome: "partial",
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

describe("buildProgressionNodes", () => {
  it("returns [] when taskId is null", () => {
    const state = stateWith({});
    expect(buildProgressionNodes(state, null)).toEqual([]);
  });

  it("returns [] when taskId is not found in state.tasks", () => {
    const state = stateWith({ tasks: [makeTask({ id: "t-1", title: "X" })] });
    expect(buildProgressionNodes(state, "not-a-real-id")).toEqual([]);
  });

  it("unplanned active task with no session: Captured/Triaged done, Planned=next, In focus=next, Done=next, one trailing speculative", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-1", title: "Unplanned task" })],
    });

    const nodes = buildProgressionNodes(state, "t-1");

    expect(nodes.map((n) => n.label)).toEqual([
      "Captured",
      "Triaged",
      "Planned",
      "In focus",
      "Done",
      "Break it down further",
    ]);
    expect(nodes[0].status).toBe("done");
    expect(nodes[1].status).toBe("done");
    expect(nodes[2].status).toBe("next"); // Planned — first non-done, but not the In-focus index so never "current"
    expect(nodes[3].status).toBe("next");
    expect(nodes[4].status).toBe("next");
    expect(nodes[5]).toEqual({
      id: "speculative-breakdown",
      label: "Break it down further",
      status: "speculative",
      kind: "speculative",
    });
  });

  it("planned task (linked non-cancelled calendar block): Planned=done, In focus becomes the frontier", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-1", title: "Planned task", status: "scheduled" }),
      ],
      calendarBlocks: [makeBlock({ id: "b-1", task_id: "t-1" })],
    });

    const nodes = buildProgressionNodes(state, "t-1");

    expect(nodes[2].status).toBe("done"); // Planned
    expect(nodes[3].status).toBe("next"); // In focus — frontier, no session yet
  });

  it("cancelled calendar block does not count as Planned", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-1", title: "Task" })],
      calendarBlocks: [
        makeBlock({ id: "b-1", task_id: "t-1", status: "cancelled" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");
    expect(nodes[2].status).toBe("next"); // Planned still not done
  });

  it("planned task with a running session for that task: In focus is current (frontier at index 3)", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-1", title: "Planned task", status: "scheduled" }),
      ],
      calendarBlocks: [makeBlock({ id: "b-1", task_id: "t-1" })],
      executionSessions: [
        makeSession({ id: "s-1", task_id: "t-1", status: "running" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");

    expect(nodes[2].status).toBe("done"); // Planned
    expect(nodes[3].status).toBe("current"); // In focus — frontier AND running
    expect(nodes[4].status).toBe("next"); // Done — later real node forced to "next"
  });

  it("frontier discriminator: UNPLANNED task with a running session for it — Planned is the frontier (next), In focus is forced to next even though its own session is running", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-1", title: "Unplanned but running" })],
      executionSessions: [
        makeSession({ id: "s-1", task_id: "t-1", status: "running" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");

    expect(nodes[2].status).toBe("next"); // Planned — first non-done real node
    expect(nodes[3].status).toBe("next"); // In focus — NOT current, even though session is running, because it isn't the frontier
  });

  it("paused session for the task also counts as In focus current when it is the frontier", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-1", title: "Planned task", status: "scheduled" }),
      ],
      calendarBlocks: [makeBlock({ id: "b-1", task_id: "t-1" })],
      executionSessions: [
        makeSession({ id: "s-1", task_id: "t-1", status: "paused" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");
    expect(nodes[3].status).toBe("current");
  });

  it("completed session for the task marks In focus done and advances the frontier to Done", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-1", title: "Planned task", status: "scheduled" }),
      ],
      calendarBlocks: [makeBlock({ id: "b-1", task_id: "t-1" })],
      executionSessions: [
        makeSession({ id: "s-1", task_id: "t-1", status: "completed" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");
    expect(nodes[3].status).toBe("done"); // In focus
    expect(nodes[4].status).toBe("next"); // Done — frontier now
  });

  it("sessions belonging to a different task are ignored (global executionSessions[0] must not leak in)", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t-1", title: "Task one" }),
        makeTask({ id: "t-2", title: "Task two" }),
      ],
      executionSessions: [
        makeSession({ id: "s-other", task_id: "t-2", status: "running" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");
    expect(nodes[3].status).toBe("next"); // In focus — no session for t-1, not current
  });

  it("fully-done task: all real nodes done, and the speculative node is still appended (exactly one trailing node)", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-1", title: "Finished task", status: "done" })],
      calendarBlocks: [makeBlock({ id: "b-1", task_id: "t-1" })],
      executionSessions: [
        makeSession({ id: "s-1", task_id: "t-1", status: "completed" }),
      ],
    });

    const nodes = buildProgressionNodes(state, "t-1");

    expect(nodes).toHaveLength(6);
    expect(nodes.slice(0, 5).every((n) => n.status === "done")).toBe(true);
    expect(nodes[5].status).toBe("speculative");
    expect(nodes.filter((n) => n.kind === "speculative")).toHaveLength(1);
  });

  it("node order is deterministic across calls for the same state", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t-1", title: "Task" })],
    });

    const first = buildProgressionNodes(state, "t-1");
    const second = buildProgressionNodes(state, "t-1");
    expect(first).toEqual(second);
  });
});
