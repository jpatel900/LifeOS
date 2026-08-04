import { describe, expect, it } from "vitest";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";
import {
  buildPlanRail,
  firstOpenHour,
  PLAN_RAIL_HOURS,
  planRailLabel,
  type PlanRailPlacement,
} from "./planRail";

/**
 * FINDING 1 of the C2-S1 capability inventory (#687): on `/calendar`, an hour
 * row said "Drop here" whenever a task was selected, but the tap did nothing
 * at all unless that task had a `first_tiny_step`. Label and behavior came
 * from two different ternaries (`PlanView.tsx:227-231` vs `:189-196`).
 *
 * Red-first: these assertions have no implementation to run against on
 * `origin/main` @ c4f96315 — `planRail.ts` does not exist there, and the rule
 * they pin (one value drives both the words and the tap) is precisely what
 * `PlanView` does not do.
 */

function task(overrides: Partial<Phase2MockTask> & { id: string }) {
  return {
    title: "Write the grant paragraph",
    first_tiny_step: "open the doc",
    ...overrides,
  } as Phase2MockTask;
}

function placementAt(hour: number): PlanRailPlacement {
  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  return {
    hour,
    task: task({ id: "task-placed", title: "Placed thing" }),
    block: {
      id: `block-${hour}`,
      start_at: start.toISOString(),
      status: "scheduled",
    } as Phase2MockCalendarBlock,
  };
}

const EMPTY = {
  placements: [],
  proposalHours: [],
  taskToPlace: null,
  candidateCount: 0,
};

describe("buildPlanRail", () => {
  it("covers the working day, 8a to 6p", () => {
    expect(PLAN_RAIL_HOURS).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(buildPlanRail(EMPTY)).toHaveLength(11);
  });

  it("FINDING 1 — a task without a first move never gets a placement invitation", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      taskToPlace: task({ id: "task-1", first_tiny_step: null }),
      candidateCount: 1,
    });

    for (const row of rail) {
      expect(row.action.kind).toBe("needsFirstMove");
      expect(planRailLabel(row.action)).toBe("Add a first move to put it here");
    }
  });

  it("FINDING 1 — whitespace is not a first move", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      taskToPlace: task({ id: "task-1", first_tiny_step: "   " }),
      candidateCount: 1,
    });
    expect(rail[0].action.kind).toBe("needsFirstMove");
  });

  it("invites the placement, by name, once the task is ready", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      taskToPlace: task({ id: "task-1", first_tiny_step: "open the doc" }),
      candidateCount: 1,
    });

    expect(rail[0].action).toEqual({
      kind: "place",
      taskId: "task-1",
      taskTitle: "Write the grant paragraph",
    });
    expect(planRailLabel(rail[0].action)).toBe("Tap to put it here");
  });

  it("a placed hour offers to take the block off, whatever else is selected", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      placements: [placementAt(10)],
      taskToPlace: task({ id: "task-1" }),
      candidateCount: 1,
    });

    const ten = rail.find((row) => row.hour === 10);
    expect(ten?.action).toEqual({
      kind: "unplan",
      blockId: "block-10",
      taskTitle: "Placed thing",
    });
    expect(planRailLabel(ten!.action)).toBe("Tap to take it off");
  });

  it("asks the user to choose when several things could go on the rail", () => {
    const rail = buildPlanRail({ ...EMPTY, candidateCount: 3 });
    expect(rail[0].action.kind).toBe("pickFirst");
    expect(planRailLabel(rail[0].action)).toBe("Pick something to place first");
  });

  it("stays quiet when there is nothing to place", () => {
    const rail = buildPlanRail(EMPTY);
    expect(rail[0].action.kind).toBe("idle");
    expect(planRailLabel(rail[0].action)).toBe("Open hour");
  });

  it("never collapses an hour that holds a block or a drafted block", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      placements: [placementAt(10)],
      proposalHours: [14],
    });

    expect(rail.find((row) => row.hour === 10)?.collapsible).toBe(false);
    expect(rail.find((row) => row.hour === 14)?.collapsible).toBe(false);
    expect(rail.find((row) => row.hour === 9)?.collapsible).toBe(true);
  });

  it("never collapses the open hours while something is ready to be placed", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      taskToPlace: task({ id: "task-1", first_tiny_step: "open the doc" }),
      candidateCount: 1,
    });
    expect(rail.every((row) => !row.collapsible)).toBe(true);
  });

  it("still collapses them when the chosen task cannot be placed yet", () => {
    const rail = buildPlanRail({
      ...EMPTY,
      taskToPlace: task({ id: "task-1", first_tiny_step: null }),
      candidateCount: 1,
    });
    // Nothing can go on the rail until the first move exists, so eleven empty
    // hours are noise standing between the user and the field that unblocks it.
    expect(rail.every((row) => row.collapsible)).toBe(true);
  });
});

describe("firstOpenHour", () => {
  it("is the start of the day when the rail is empty", () => {
    expect(firstOpenHour([])).toBe(8);
  });

  it("skips hours that already hold a block", () => {
    expect(firstOpenHour([placementAt(8), placementAt(9)])).toBe(10);
  });

  it("falls back to 9 on a completely full day rather than proposing nothing", () => {
    expect(firstOpenHour(PLAN_RAIL_HOURS.map(placementAt))).toBe(9);
  });
});
