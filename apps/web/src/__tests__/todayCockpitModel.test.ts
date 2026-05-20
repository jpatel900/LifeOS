import { describe, expect, it } from "vitest";
import {
  buildTodayCockpitModel,
  type BuildTodayCockpitModelInput,
} from "@/lib/today/buildTodayCockpitModel";

function baseInput(
  overrides: Partial<BuildTodayCockpitModelInput> = {},
): BuildTodayCockpitModelInput {
  return {
    tasks: [],
    drafts: [],
    proposals: [],
    blocks: [],
    sessions: [],
    ...overrides,
  };
}

describe("buildTodayCockpitModel", () => {
  it("recommends Capture for an empty state", () => {
    const model = buildTodayCockpitModel(baseInput());

    expect(model.next.kind).toBe("capture");
    expect(model.next.href).toBe("/capture");
  });

  it("prioritizes recovery over needs-decision", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        drafts: [{ id: "d-1", title: "Draft", kind: "task" }],
        sessions: [
          {
            id: "s-1",
            taskId: "t-1",
            calendarBlockId: null,
            status: "stuck",
            outcome: "blocked",
          },
        ],
      }),
    );

    expect(model.next.kind).toBe("recovery");
    expect(model.next.href).toBe("/execute");
  });

  it("prioritizes needs-decision over unplanned tasks", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        tasks: [{ id: "t-1", title: "Active task", status: "active" }],
        drafts: [{ id: "d-1", title: "Draft", kind: "task" }],
      }),
    );

    expect(model.next.kind).toBe("needs_decision");
    expect(model.next.href).toBe("/triage");
  });

  it("prioritizes running or paused session over planned blocks", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        tasks: [{ id: "t-1", title: "Task", status: "active" }],
        blocks: [
          {
            id: "b-1",
            taskId: "t-1",
            startAt: "2026-05-20T09:00:00.000-04:00",
            endAt: "2026-05-20T10:00:00.000-04:00",
            status: "scheduled",
          },
        ],
        sessions: [
          {
            id: "s-1",
            taskId: "t-1",
            calendarBlockId: "b-1",
            status: "paused",
            outcome: "partial",
          },
        ],
      }),
    );

    expect(model.next.kind).toBe("current_work");
    expect(model.now.kind).toBe("session");
  });

  it("does not classify tasks with active proposal or block as unplanned", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        tasks: [
          { id: "t-1", title: "With proposal", status: "active" },
          { id: "t-2", title: "With block", status: "active" },
          { id: "t-3", title: "Actually unplanned", status: "active" },
        ],
        proposals: [{ id: "p-1", taskId: "t-1", status: "proposed" }],
        blocks: [
          {
            id: "b-1",
            taskId: "t-2",
            startAt: "2026-05-20T09:00:00.000-04:00",
            endAt: "2026-05-20T10:00:00.000-04:00",
            status: "scheduled",
          },
        ],
      }),
    );

    expect(model.unplanned.items.map((task) => task.id)).toEqual(["t-3"]);
  });

  it("filters today blocks using local day boundaries", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        now: new Date("2026-05-20T12:00:00.000-04:00"),
        timezone: "America/Toronto",
        blocks: [
          {
            id: "b-before",
            taskId: null,
            startAt: "2026-05-19T23:59:00.000-04:00",
            endAt: "2026-05-20T00:20:00.000-04:00",
            status: "scheduled",
          },
          {
            id: "b-today",
            taskId: null,
            startAt: "2026-05-20T09:00:00.000-04:00",
            endAt: "2026-05-20T09:30:00.000-04:00",
            status: "running",
          },
          {
            id: "b-after",
            taskId: null,
            startAt: "2026-05-21T00:00:00.000-04:00",
            endAt: "2026-05-21T00:30:00.000-04:00",
            status: "scheduled",
          },
        ],
      }),
    );

    expect(model.todayBlocks.map((block) => block.id)).toEqual(["b-today"]);
  });

  it("falls back to Health link when health status is unavailable", () => {
    const model = buildTodayCockpitModel(
      baseInput({
        health: { state: "unavailable" },
      }),
    );

    expect(model.systemStatus.href).toBe("/health");
    expect(model.systemStatus.summary).toContain("Open Health");
  });
});
