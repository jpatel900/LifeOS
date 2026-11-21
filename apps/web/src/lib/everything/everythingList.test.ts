import { describe, expect, it } from "vitest";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";
import type { Phase2MockArea, Phase2MockTask } from "@/lib/types";
import type { Phase2CaptureItem, Phase2TaskDraft } from "@lifeos/schemas";
import {
  buildEverythingList,
  splitSourceMark,
  EVERYTHING_NO_AREA,
  EVERYTHING_SOURCE_YOU,
  type EverythingFilters,
} from "./everythingList";

// Local noon, so no test below depends on the machine's time zone.
const NOW = new Date(2026, 10, 18, 12, 0, 0);
const at = (dayOffset: number, hour = 9) =>
  new Date(2026, 10, 18 + dayOffset, hour, 0, 0).toISOString();

function makeArea(id: string, name: string): Phase2MockArea {
  return { id, user_id: "user-1", name, color: "#123456", created_at: at(-30) };
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
    created_at: at(-3),
    updated_at: at(-3),
    ...overrides,
  } as Phase2MockTask;
}

function makeCapture(
  overrides: Partial<Phase2CaptureItem> & { id: string },
): Phase2CaptureItem {
  return {
    user_id: "user-1",
    area_id: "area-1",
    raw_text: "Some thought",
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: at(-1),
    ...overrides,
  };
}

function makeDraft(
  overrides: Partial<Phase2TaskDraft> & { id: string; capture_item_id: string },
): Phase2TaskDraft {
  return {
    user_id: "user-1",
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
    created_at: at(-1),
    ...overrides,
  };
}

function stateWith(partial: Partial<ReturnType<typeof workflowSeed>>) {
  return {
    ...workflowSeed(),
    areas: [makeArea("area-1", "Work"), makeArea("area-2", "Home")],
    captureItems: [],
    taskDrafts: [],
    tasks: [],
    ...partial,
  };
}

const ALL: EverythingFilters = {
  grouping: "stage",
  showClosed: true,
  search: "",
  areaId: null,
  source: null,
};

function build(
  partial: Partial<ReturnType<typeof workflowSeed>>,
  filters: Partial<EverythingFilters> = {},
) {
  return buildEverythingList(stateWith(partial), { ...ALL, ...filters }, NOW);
}

/** Identity, never a bare count: a length can be right for the wrong rows. */
function titles(list: ReturnType<typeof build>, groupId?: string) {
  return list.groups
    .filter((group) => (groupId ? group.id === groupId : true))
    .flatMap((group) => group.items.map((item) => item.title));
}

describe("one item, one truth (#1160)", () => {
  it("lists a thought that became a task once, as the task, with the thought's date", () => {
    const list = build({
      captureItems: [
        makeCapture({
          id: "c1",
          raw_text: "call the bank",
          created_at: at(-5),
        }),
      ],
      tasks: [
        makeTask({
          id: "t1",
          title: "Call the bank",
          source_capture_item_id: "c1",
          created_at: at(-2),
        }),
      ],
    });
    expect(titles(list)).toEqual(["Call the bank"]);
    const item = list.groups[0]?.items[0];
    expect(item?.kind).toBe("task");
    expect(item?.enteredAt).toBe(at(-5));
    expect(list.total).toBe(1);
  });

  it("lists every pending draft of one thought, the rows Sort offers, and not the thought", () => {
    const list = build({
      captureItems: [makeCapture({ id: "c1", raw_text: "plan the trip" })],
      taskDrafts: [
        makeDraft({ id: "d1", capture_item_id: "c1", title: "Plan the trip" }),
        makeDraft({ id: "d2", capture_item_id: "c1", title: "Book flights" }),
      ],
    });
    expect(titles(list, "draft")).toEqual(["Plan the trip", "Book flights"]);
    expect(titles(list)).toEqual(["Plan the trip", "Book flights"]);
  });

  it("still lists a pending draft when its thought already has a task", () => {
    const list = build({
      captureItems: [makeCapture({ id: "c1", raw_text: "trip things" })],
      taskDrafts: [
        makeDraft({ id: "d1", capture_item_id: "c1", title: "Book flights" }),
      ],
      tasks: [
        makeTask({
          id: "t1",
          title: "Renew passport",
          source_capture_item_id: "c1",
        }),
      ],
    });
    expect(titles(list, "draft")).toEqual(["Book flights"]);
    expect(titles(list, "ready")).toEqual(["Renew passport"]);
    expect(list.total).toBe(2);
  });

  it("agrees with Sort: a thought whose only draft was set aside is not waiting", () => {
    const list = build({
      captureItems: [makeCapture({ id: "c1", raw_text: "maybe a podcast" })],
      taskDrafts: [
        makeDraft({ id: "d1", capture_item_id: "c1", status: "rejected" }),
      ],
    });
    expect(titles(list, "thought")).toEqual([]);
    expect(titles(list, "letgo")).toEqual(["maybe a podcast"]);
  });

  it("shows a dealt-with thought that has no task here as sorted, not let go", () => {
    const list = build({
      captureItems: [
        makeCapture({
          id: "c1",
          raw_text: "start the garden project",
          status: "resolved",
        }),
      ],
    });
    expect(titles(list, "sorted")).toEqual(["start the garden project"]);
    expect(list.open).toBe(0);
    expect(list.closed).toBe(1);
  });

  it("never loses an archived or composted thought: it shows as let go", () => {
    const list = build({
      captureItems: [
        makeCapture({ id: "c1", raw_text: "old idea", status: "composted" }),
        makeCapture({ id: "c2", raw_text: "older idea", status: "archived" }),
      ],
    });
    expect(titles(list, "letgo").sort()).toEqual(["old idea", "older idea"]);
  });
});

describe("stages", () => {
  it("maps every task status to a plain-word stage", () => {
    const list = build({
      tasks: [
        makeTask({ id: "a", title: "active", status: "active" }),
        makeTask({ id: "b", title: "backlog", status: "backlog" }),
        makeTask({ id: "c", title: "scheduled", status: "scheduled" }),
        makeTask({ id: "d", title: "blocked", status: "blocked" }),
        makeTask({
          id: "e",
          title: "waiting on someone",
          waiting_on_person_id: "11111111-1111-4111-8111-111111111111",
        }),
        makeTask({ id: "f", title: "done", status: "done" }),
        makeTask({ id: "g", title: "dropped", status: "dropped" }),
        makeTask({ id: "h", title: "archived", status: "archived" }),
        makeTask({ id: "i", title: "not accepted yet", status: "draft" }),
      ],
    });
    expect(list.groups.map((group) => group.label)).toEqual([
      "Draft",
      "Ready",
      "Scheduled",
      "Waiting",
      "Done",
      "Let go",
    ]);
    expect(titles(list, "draft")).toEqual(["not accepted yet"]);
    expect(titles(list, "ready").sort()).toEqual(["active", "backlog"]);
    expect(titles(list, "waiting").sort()).toEqual([
      "blocked",
      "waiting on someone",
    ]);
    expect(titles(list, "letgo").sort()).toEqual(["archived", "dropped"]);
  });

  it("counts total and open before any filter, and hides closed by default", () => {
    const partial = {
      tasks: [
        makeTask({ id: "a", title: "open one" }),
        makeTask({ id: "b", title: "finished", status: "done" as const }),
      ],
      captureItems: [makeCapture({ id: "c1", raw_text: "a thought" })],
    };
    const list = build(partial, { showClosed: false, search: "open" });
    expect(list.total).toBe(3);
    expect(list.open).toBe(2);
    expect(list.closed).toBe(1);
    expect(list.narrowed).toBe(true);
    expect(list.shown).toBe(1);
    expect(titles(list)).toEqual(["open one"]);
  });
});

describe("groupings", () => {
  const tasks = [
    makeTask({ id: "late", title: "was due", due_at: at(-2) }),
    makeTask({ id: "today", title: "due today", due_at: at(0, 17) }),
    makeTask({ id: "soon", title: "due in 3 days", due_at: at(3) }),
    makeTask({ id: "far", title: "due in a month", due_at: at(30) }),
    makeTask({ id: "none", title: "no date" }),
    makeTask({ id: "shut", title: "finished", status: "done", due_at: at(-9) }),
  ];

  it("groups by due date with a no-shame name for past dates", () => {
    const list = build({ tasks }, { grouping: "due" });
    expect(
      list.groups.map((group) => [group.label, titles(list, group.id)]),
    ).toEqual([
      ["Earlier", ["was due"]],
      ["Today", ["due today"]],
      ["Next 7 days", ["due in 3 days"]],
      ["Later", ["due in a month"]],
      ["No date", ["no date"]],
      ["Closed", ["finished"]],
    ]);
    expect(list.groups[1]?.items[0]?.dueLabel).toBe("Today");
  });

  it("treats a due time that is not a real time as no date", () => {
    const list = build(
      { tasks: [makeTask({ id: "odd", title: "odd date", due_at: "soon" })] },
      { grouping: "due" },
    );
    expect(list.groups.map((group) => group.label)).toEqual(["No date"]);
    expect(list.groups[0]?.items[0]?.dueLabel).toBe("");
  });

  it("orders by the real time, whatever shape the stored time has", () => {
    const list = build(
      {
        tasks: [
          makeTask({
            id: "b",
            title: "second",
            due_at: "2026-11-25T15:00:00+00:00",
          }),
          makeTask({
            id: "a",
            title: "first",
            due_at: "2026-11-25T14:00:00.000Z",
          }),
        ],
      },
      { grouping: "stage" },
    );
    expect(titles(list)).toEqual(["first", "second"]);
  });

  it("groups by area and names items with no area", () => {
    const list = build(
      {
        tasks: [
          makeTask({ id: "w", title: "work task" }),
          makeTask({ id: "h", title: "home task", area_id: "area-2" }),
        ],
        captureItems: [
          makeCapture({ id: "c", raw_text: "loose thought", area_id: null }),
        ],
      },
      { grouping: "area" },
    );
    expect(
      list.groups.map((group) => [group.label, titles(list, group.id)]),
    ).toEqual([
      ["Work", ["work task"]],
      ["Home", ["home task"]],
      ["No area", ["loose thought"]],
    ]);
  });

  it("groups by date entered, newest first, with how far each item got", () => {
    const list = build(
      {
        captureItems: [
          makeCapture({
            id: "c1",
            raw_text: "today thought",
            created_at: at(0),
          }),
          makeCapture({ id: "c2", raw_text: "yesterday", created_at: at(-1) }),
        ],
        tasks: [
          makeTask({
            id: "t",
            title: "old and done",
            status: "done",
            created_at: at(-6),
          }),
        ],
      },
      { grouping: "entered" },
    );
    expect(list.groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Nov 12",
    ]);
    expect(
      list.groups.flatMap((group) => group.items.map((item) => item.trailStep)),
    ).toEqual([0, 0, 3]);
    expect(new Set(list.groups.map((group) => group.id)).size).toBe(3);
  });
});

describe("filters and the source mark", () => {
  const partial = {
    captureItems: [
      makeCapture({ id: "c1", raw_text: "Send the numbers (via Hermes)" }),
      makeCapture({ id: "c2", raw_text: "Buy milk", area_id: "area-2" }),
      makeCapture({ id: "c3", raw_text: "Draft the plan (via Claude)" }),
    ],
    tasks: [
      makeTask({
        id: "t1",
        title: "Send the numbers",
        source_capture_item_id: "c1",
      }),
    ],
  };

  it("reads the mark off the thought, strips it from the title, and carries it to the task", () => {
    const list = build(partial);
    const sent = list.groups
      .flatMap((group) => group.items)
      .find((item) => item.title === "Send the numbers");
    expect(sent?.kind).toBe("task");
    expect(sent?.source).toBe("Hermes");
    expect(list.sources).toEqual(["Claude", "Hermes"]);
  });

  it("filters by who entered it, by area, and by search", () => {
    expect(titles(build(partial, { source: "Hermes" }))).toEqual([
      "Send the numbers",
    ]);
    expect(titles(build(partial, { source: EVERYTHING_SOURCE_YOU }))).toEqual([
      "Buy milk",
    ]);
    expect(titles(build(partial, { areaId: "area-2" }))).toEqual(["Buy milk"]);
    expect(build(partial).narrowed).toBe(false);
    expect(build(partial, { areaId: "area-2" }).narrowed).toBe(true);
    expect(titles(build(partial, { search: "  DRAFT " }))).toEqual([
      "Draft the plan",
    ]);
  });

  it("offers items with no area their own filter choice", () => {
    const loose = {
      captureItems: [
        makeCapture({ id: "c1", raw_text: "loose thought", area_id: null }),
        makeCapture({ id: "c2", raw_text: "filed thought" }),
      ],
    };
    expect(build(loose).hasNoAreaItems).toBe(true);
    expect(titles(build(loose, { areaId: EVERYTHING_NO_AREA }))).toEqual([
      "loose thought",
    ]);
    expect(
      build({ captureItems: [makeCapture({ id: "c2" })] }).hasNoAreaItems,
    ).toBe(false);
  });

  it("leaves the owner's own words alone: only a known agent name is a mark", () => {
    expect(splitSourceMark("Pick up parcel (via Canada Post)")).toEqual({
      title: "Pick up parcel (via Canada Post)",
      source: null,
    });
    expect(splitSourceMark("Send it (via hermes)")).toEqual({
      title: "Send it",
      source: "Hermes",
    });
  });

  it("only treats a trailing (via Name) as a mark", () => {
    expect(splitSourceMark("Go (via the park) home")).toEqual({
      title: "Go (via the park) home",
      source: null,
    });
    expect(splitSourceMark("(via Hermes)")).toEqual({
      title: "(via Hermes)",
      source: null,
    });
    expect(splitSourceMark("Note  (via Hermes) ")).toEqual({
      title: "Note",
      source: "Hermes",
    });
  });

  it("returns no groups, not an error, when nothing exists", () => {
    const list = build({});
    expect(list).toMatchObject({
      total: 0,
      open: 0,
      closed: 0,
      shown: 0,
      narrowed: false,
      hasNoAreaItems: false,
      groups: [],
    });
  });
});
