import { describe, expect, it } from "vitest";
import { computeNodeColumns, groupIntoColumns } from "./layout";
import type { TaskMapGraph } from "./graph";

const branchingGraph: TaskMapGraph = {
  nodes: [
    { id: "req-1", title: "Draft outline", role: "required" },
    { id: "req-2a", title: "Path A", role: "required" },
    { id: "req-2b", title: "Path B", role: "required" },
    { id: "req-3", title: "Merge and ship", role: "required" },
    { id: "opt-1", title: "Nice to have", role: "optional" },
  ],
  edges: [
    { from: "req-1", to: "req-2a" },
    { from: "req-1", to: "req-2b" },
    { from: "req-2a", to: "req-3" },
    { from: "req-2b", to: "req-3" },
  ],
};

describe("computeNodeColumns", () => {
  it("places the root at column 0 and branch nodes one column deeper", () => {
    const columns = computeNodeColumns(branchingGraph);
    expect(columns.get("req-1")).toBe(0);
    expect(columns.get("req-2a")).toBe(1);
    expect(columns.get("req-2b")).toBe(1);
    expect(columns.get("req-3")).toBe(2);
  });

  it("places an edgeless node at column 0", () => {
    const columns = computeNodeColumns(branchingGraph);
    expect(columns.get("opt-1")).toBe(0);
  });
});

describe("groupIntoColumns", () => {
  it("groups node ids by column, sorted ascending with deterministic ordering", () => {
    const grouped = groupIntoColumns(branchingGraph);
    expect(grouped).toEqual([
      { index: 0, nodeIds: ["opt-1", "req-1"] },
      { index: 1, nodeIds: ["req-2a", "req-2b"] },
      { index: 2, nodeIds: ["req-3"] },
    ]);
  });
});
