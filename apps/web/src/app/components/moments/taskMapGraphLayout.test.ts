import { describe, expect, it } from "vitest";
import type { TaskMapGraph } from "@/lib/taskmap/graph";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  computeGraphLayout,
} from "./taskMapGraphLayout";

const graph: TaskMapGraph = {
  nodes: [
    { id: "r1", title: "Start", role: "required" },
    { id: "r2", title: "Middle", role: "required" },
    { id: "r3", title: "End", role: "required" },
    { id: "o1", title: "Side", role: "optional" },
  ],
  edges: [
    { from: "r1", to: "r2" },
    { from: "r2", to: "r3" },
    { from: "r1", to: "o1" },
  ],
};

const criticalIds = ["r1", "r2", "r3"];

describe("computeGraphLayout", () => {
  it("positions each visible node once with the fixed box size", () => {
    const layout = computeGraphLayout(
      graph,
      graph.nodes.map((n) => n.id),
      criticalIds,
    );

    expect(layout.nodes).toHaveLength(4);
    for (const node of layout.nodes) {
      expect(node.width).toBe(NODE_WIDTH);
      expect(node.height).toBe(NODE_HEIGHT);
    }
  });

  it("lays the critical path out along one row (columns increasing)", () => {
    const layout = computeGraphLayout(
      graph,
      graph.nodes.map((n) => n.id),
      criticalIds,
    );
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));

    expect(byId.get("r1")?.col).toBe(0);
    expect(byId.get("r2")?.col).toBe(1);
    expect(byId.get("r3")?.col).toBe(2);
    // Critical nodes are biased to the top row.
    expect(byId.get("r1")?.row).toBe(0);
    expect(byId.get("r2")?.row).toBe(0);
    expect(byId.get("r3")?.row).toBe(0);
    // The off-path optional node shares r2's column (distance 1 from root) but
    // is pushed to a lower row so it never overlaps the spine.
    expect(byId.get("o1")?.row).toBeGreaterThan(0);
  });

  it("marks only consecutive-critical edges as critical and anchors edges box-to-box", () => {
    const layout = computeGraphLayout(
      graph,
      graph.nodes.map((n) => n.id),
      criticalIds,
    );

    expect(layout.edges).toHaveLength(3);
    const byKey = new Map(layout.edges.map((e) => [`${e.from}-${e.to}`, e]));

    expect(byKey.get("r1-r2")?.onCriticalPath).toBe(true);
    expect(byKey.get("r2-r3")?.onCriticalPath).toBe(true);
    expect(byKey.get("r1-o1")?.onCriticalPath).toBe(false);

    // Path starts at the right edge of r1 (x = padding + NODE_WIDTH).
    expect(byKey.get("r1-r2")?.d.startsWith("M ")).toBe(true);
  });

  it("only draws edges whose endpoints are both visible", () => {
    const layout = computeGraphLayout(graph, criticalIds, criticalIds);
    // o1 is not visible, so the r1 -> o1 edge is dropped.
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges.every((e) => e.from !== "o1" && e.to !== "o1")).toBe(
      true,
    );
  });
});
