import { describe, expect, it } from "vitest";
import { buildTaskMapCollapseView, mapApprovedAgeLabel } from "./collapse";
import type { TaskMapGraph } from "./graph";

// One level of required branching, no re-convergence (the graph engine's
// nested-branch rule rejects a branch point reaching a merge point — see
// apps/web/src/lib/taskmap/graph.test.ts "accepts one level of required
// branching" / "rejects nested required branching"). req-2b's chain is
// longer than req-2a's, so it wins the critical path.
const branchingGraph: TaskMapGraph = {
  nodes: [
    { id: "req-1", title: "Draft outline", role: "required", done: true },
    { id: "req-2a", title: "Path A", role: "required", done: false },
    { id: "req-2b", title: "Path B (longer)", role: "required", done: false },
    { id: "req-2b-2", title: "Path B step 2", role: "required", done: false },
    { id: "opt-1", title: "Nice to have", role: "optional", done: false },
    {
      id: "red-1",
      title: "Do not skip review",
      role: "red",
      red_reason: "Compliance requires review.",
    },
  ],
  edges: [
    { from: "req-1", to: "req-2a" },
    { from: "req-1", to: "req-2b" },
    { from: "req-2b", to: "req-2b-2" },
  ],
};

describe("buildTaskMapCollapseView", () => {
  it("selects the longest required path as critical and folds the rest", () => {
    const view = buildTaskMapCollapseView(branchingGraph);

    expect(view.criticalNodes.map((node) => node.id)).toEqual([
      "req-1",
      "req-2b",
      "req-2b-2",
    ]);

    const hiddenIds = view.hiddenNodes.map((node) => node.id).sort();
    expect(hiddenIds).toEqual(["opt-1", "red-1", "req-2a"]);
  });

  it("identifies the first not-done critical node as next actionable", () => {
    const view = buildTaskMapCollapseView(branchingGraph);
    expect(view.nextActionableId).toBe("req-2b");
  });

  it("returns null next actionable when every critical node is done", () => {
    const allDone: TaskMapGraph = {
      nodes: branchingGraph.nodes.map((node) =>
        node.role === "required" ? { ...node, done: true } : node,
      ),
      edges: branchingGraph.edges,
    };

    const view = buildTaskMapCollapseView(allDone);
    expect(view.nextActionableId).toBeNull();
  });

  it("returns empty critical/hidden-all for an invalid graph", () => {
    const invalid: TaskMapGraph = {
      nodes: [{ id: "a", title: "A", role: "required" }],
      edges: [{ from: "a", to: "missing" }],
    };

    const view = buildTaskMapCollapseView(invalid);
    expect(view.criticalNodes).toEqual([]);
    expect(view.hiddenNodes.map((n) => n.id)).toEqual(["a"]);
  });
});

describe("mapApprovedAgeLabel", () => {
  it("returns null when there is no approval timestamp", () => {
    expect(mapApprovedAgeLabel(null, new Date())).toBeNull();
  });

  it("labels recent approvals as just now", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const approvedAt = new Date("2026-07-12T11:45:00.000Z").toISOString();
    expect(mapApprovedAgeLabel(approvedAt, now)).toBe("Mapped just now");
  });

  it("labels hour-scale gaps", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const approvedAt = new Date("2026-07-12T09:00:00.000Z").toISOString();
    expect(mapApprovedAgeLabel(approvedAt, now)).toBe("Mapped 3 hours ago");
  });

  it("labels day-scale gaps", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const approvedAt = new Date("2026-07-09T12:00:00.000Z").toISOString();
    expect(mapApprovedAgeLabel(approvedAt, now)).toBe("Mapped 3 days ago");
  });
});
