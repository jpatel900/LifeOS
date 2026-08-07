import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type { Phase2MockArea, Phase2MockTask } from "@/lib/types";
import type { Phase2CaptureItem, Phase2TaskDraft } from "@lifeos/schemas";
import {
  areasOverviewTiesOut,
  buildAreasOverview,
  type AreasOverviewColumnId,
} from "./areasOverview";

const YESTERDAY = "2026-07-04T09:00:00.000Z";

function makeArea(
  overrides: Partial<Phase2MockArea> & { id: string },
): Phase2MockArea {
  return {
    user_id: "user-1",
    name: `Area ${overrides.id}`,
    color: "#123456",
    created_at: YESTERDAY,
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
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
    ...overrides,
  } as Phase2MockTask;
}

function makeCapture(
  overrides: Partial<Phase2CaptureItem> & { id: string },
): Phase2CaptureItem {
  return {
    user_id: "user-1",
    area_id: "area-1",
    raw_text: "Some capture",
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function makeDraft(
  overrides: Partial<Phase2TaskDraft> & { id: string },
): Phase2TaskDraft {
  return {
    user_id: "user-1",
    capture_item_id: `${overrides.id}-from`,
    area_id: "area-1",
    title: "Draft task",
    description: null,
    confidence: 0.8,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    first_tiny_step: null,
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function stateWith(partial: Partial<WorkflowState>): WorkflowState {
  return {
    ...createInitialWorkflowState(),
    areas: [makeArea({ id: "area-1" }), makeArea({ id: "area-2" })],
    ...partial,
  };
}

function column(vm: ReturnType<typeof buildAreasOverview>, id: string) {
  const found = vm.columns.find((item) => item.id === id);
  if (!found) throw new Error(`No column ${id}`);
  return found;
}

/** Identity, never a bare count — a length can be right for the wrong rows. */
function titlesIn(
  vm: ReturnType<typeof buildAreasOverview>,
  id: AreasOverviewColumnId,
) {
  return column(vm, id).items.map((item) => item.title);
}

function openCountFor(vm: ReturnType<typeof buildAreasOverview>, id: string) {
  const row = vm.rows.find((item) => item.area.id === id);
  if (!row) throw new Error(`No row ${id}`);
  return row.openCount;
}

describe("buildAreasOverview", () => {
  it("names its four columns in plain language, decisions first", () => {
    const vm = buildAreasOverview(stateWith({}));
    expect(vm.columns.map((item) => item.id)).toEqual([
      "decide",
      "plan",
      "scheduled",
      "done",
    ]);
    expect(vm.columns.map((item) => item.title)).toEqual([
      "Waiting for a decision",
      "To plan",
      "Scheduled",
      "Done",
    ]);
  });

  it("says what each empty column is and one next step, never a bare 'Empty'", () => {
    const vm = buildAreasOverview(stateWith({}));
    for (const item of vm.columns) {
      expect(item.items).toEqual([]);
      expect(item.emptyWhat.length).toBeGreaterThan(0);
      expect(item.emptyNext.length).toBeGreaterThan(0);
    }
    expect(column(vm, "decide").emptyWhat).toBe(
      "Nothing is waiting for a decision.",
    );
  });

  /**
   * S1 FINDING 2, as a regression test. On the legacy screen this exact state —
   * one unsorted capture in the account, no drafts — rendered "Nothing is
   * waiting for a decision."
   */
  it("counts an unsorted capture as waiting for a decision (FINDING 2)", () => {
    const vm = buildAreasOverview(
      stateWith({
        captureItems: [
          makeCapture({ id: "capture-1", raw_text: "Book the dentist" }),
        ],
      }),
    );

    expect(titlesIn(vm, "decide")).toEqual(["Book the dentist"]);
    expect(openCountFor(vm, "area-1")).toBe(1);
  });

  it("shows one thought once, as its draft, after it has been sorted", () => {
    // `selectUnsortedCaptures` drops any capture a draft points at, so the two
    // sources are disjoint by construction rather than by a dedupe pass.
    const vm = buildAreasOverview(
      stateWith({
        captureItems: [
          makeCapture({ id: "capture-1", raw_text: "Book the dentist" }),
        ],
        taskDrafts: [
          makeDraft({
            id: "draft-1",
            capture_item_id: "capture-1",
            title: "Book the dentist appointment",
          }),
        ],
      }),
    );

    expect(titlesIn(vm, "decide")).toEqual(["Book the dentist appointment"]);
    expect(openCountFor(vm, "area-1")).toBe(1);
  });

  /**
   * The legacy count included `backlog` and `blocked` tasks while no column
   * rendered them: counted, but nowhere on the screen to be found.
   */
  it("shows the backlog and blocked work its count includes", () => {
    const vm = buildAreasOverview(
      stateWith({
        tasks: [
          makeTask({ id: "task-1", title: "Active one", status: "active" }),
          makeTask({ id: "task-2", title: "Backlog one", status: "backlog" }),
          makeTask({ id: "task-3", title: "Blocked one", status: "blocked" }),
        ],
      }),
    );

    expect(titlesIn(vm, "plan")).toEqual([
      "Active one",
      "Backlog one",
      "Blocked one",
    ]);
    expect(openCountFor(vm, "area-1")).toBe(3);
  });

  it("keeps finished work out of the open count", () => {
    const vm = buildAreasOverview(
      stateWith({
        tasks: [
          makeTask({ id: "task-1", title: "Finished", status: "done" }),
          makeTask({ id: "task-2", title: "Scheduled", status: "scheduled" }),
        ],
      }),
    );

    expect(titlesIn(vm, "done")).toEqual(["Finished"]);
    expect(titlesIn(vm, "scheduled")).toEqual(["Scheduled"]);
    expect(openCountFor(vm, "area-1")).toBe(1);
    expect(vm.totalOpen).toBe(1);
  });

  it("attributes every area's work to that area, across all of them", () => {
    const vm = buildAreasOverview(
      stateWith({
        captureItems: [
          makeCapture({ id: "cap-1", area_id: "area-2", raw_text: "Two's" }),
        ],
        tasks: [
          makeTask({ id: "task-1", title: "One's", area_id: "area-1" }),
          makeTask({
            id: "task-2",
            title: "Two's task",
            area_id: "area-2",
            status: "scheduled",
          }),
        ],
      }),
    );

    expect(vm.rows.map((row) => [row.area.id, row.openCount])).toEqual([
      ["area-1", 1],
      ["area-2", 2],
    ]);
    expect(vm.totalOpen).toBe(3);
    // Identity, not just arithmetic: the right rows landed in the right area.
    expect(
      column(vm, "decide").items.map((item) => [item.title, item.areaId]),
    ).toEqual([["Two's", "area-2"]]);
    expect(titlesIn(vm, "plan")).toEqual(["One's"]);
  });

  it("carries each item's area name and colour for the dot beside it", () => {
    const vm = buildAreasOverview(
      stateWith({
        areas: [makeArea({ id: "area-1", name: "Main Job", color: "#ff0000" })],
        tasks: [makeTask({ id: "task-1", title: "One" })],
      }),
    );

    expect(column(vm, "plan").items[0]).toMatchObject({
      areaName: "Main Job",
      areaColor: "#ff0000",
    });
  });

  it("drops rows whose area no longer exists, from the columns AND the count", () => {
    const vm = buildAreasOverview(
      stateWith({
        areas: [makeArea({ id: "area-1" })],
        tasks: [
          makeTask({ id: "task-1", title: "Kept", area_id: "area-1" }),
          makeTask({ id: "task-2", title: "Orphan", area_id: "area-gone" }),
        ],
      }),
    );

    expect(titlesIn(vm, "plan")).toEqual(["Kept"]);
    expect(vm.totalOpen).toBe(1);
    expect(areasOverviewTiesOut(vm)).toBe(true);
  });

  it("has no areas and no work to show on a brand-new account", () => {
    const vm = buildAreasOverview(stateWith({ areas: [] }));
    expect(vm.rows).toEqual([]);
    expect(vm.totalOpen).toBe(0);
    expect(areasOverviewTiesOut(vm)).toBe(true);
  });

  /**
   * The property the surface is built on. Pinned as a property rather than as
   * example numbers, because example numbers can all drift together — which is
   * how the legacy chips came to disagree with the lists beneath them.
   */
  describe("the per-area count is the columns, so the two cannot disagree", () => {
    const cases: Record<string, WorkflowState> = {
      empty: stateWith({}),
      "captures only": stateWith({
        captureItems: [
          makeCapture({ id: "c-1" }),
          makeCapture({ id: "c-2", area_id: "area-2" }),
        ],
      }),
      "every stage in both areas": stateWith({
        captureItems: [
          makeCapture({ id: "c-1" }),
          makeCapture({ id: "c-2", area_id: "area-2" }),
        ],
        taskDrafts: [
          makeDraft({ id: "d-1" }),
          makeDraft({ id: "d-2", area_id: "area-2" }),
        ],
        tasks: [
          makeTask({ id: "t-1", title: "A", status: "active" }),
          makeTask({ id: "t-2", title: "B", status: "backlog" }),
          makeTask({ id: "t-3", title: "C", status: "blocked" }),
          makeTask({ id: "t-4", title: "D", status: "scheduled" }),
          makeTask({ id: "t-5", title: "E", status: "done" }),
          makeTask({
            id: "t-6",
            title: "F",
            status: "active",
            area_id: "area-2",
          }),
          makeTask({
            id: "t-7",
            title: "G",
            status: "scheduled",
            area_id: "area-2",
          }),
        ],
      }),
      "work in an area that no longer exists": stateWith({
        tasks: [
          makeTask({ id: "t-1", title: "A" }),
          makeTask({ id: "t-2", title: "B", area_id: "area-gone" }),
        ],
      }),
    };

    for (const [name, state] of Object.entries(cases)) {
      it(`ties out: ${name}`, () => {
        expect(areasOverviewTiesOut(buildAreasOverview(state))).toBe(true);
      });
    }
  });
});
