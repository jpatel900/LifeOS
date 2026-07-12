import { describe, expect, it } from "vitest";
import {
  buildTaskMapCollapseView,
  carryForwardNodeCompletion,
  mapApprovedAgeLabel,
  toggleNodeCompletion,
} from "./collapse";
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

  it("treats completed_at (without done) as done for next-actionable selection", () => {
    const withTimestampOnly: TaskMapGraph = {
      nodes: branchingGraph.nodes.map((node) =>
        node.id === "req-1"
          ? {
              ...node,
              done: undefined,
              completed_at: "2026-07-12T09:00:00.000Z",
            }
          : node,
      ),
      edges: branchingGraph.edges,
    };

    const view = buildTaskMapCollapseView(withTimestampOnly);
    expect(view.nextActionableId).toBe("req-2b");
  });
});

describe("toggleNodeCompletion", () => {
  const now = "2026-07-12T12:00:00.000Z";

  it("marks a not-done required node complete, setting done and completed_at", () => {
    const updated = toggleNodeCompletion(branchingGraph, "req-2a", now);
    const node = updated.nodes.find((candidate) => candidate.id === "req-2a");
    expect(node?.done).toBe(true);
    expect(node?.completed_at).toBe(now);
  });

  it("marks an optional node complete", () => {
    const updated = toggleNodeCompletion(branchingGraph, "opt-1", now);
    const node = updated.nodes.find((candidate) => candidate.id === "opt-1");
    expect(node?.done).toBe(true);
    expect(node?.completed_at).toBe(now);
  });

  it("undoes a completed node back to not-done (reversible, no ratchet)", () => {
    const done = toggleNodeCompletion(branchingGraph, "req-2a", now);
    const undone = toggleNodeCompletion(
      done,
      "req-2a",
      "2026-07-12T13:00:00.000Z",
    );
    const node = undone.nodes.find((candidate) => candidate.id === "req-2a");
    expect(node?.done).toBe(false);
    expect(node?.completed_at).toBeNull();
  });

  it("rejects red nodes, returning the same graph reference unchanged", () => {
    const result = toggleNodeCompletion(branchingGraph, "red-1", now);
    expect(result).toBe(branchingGraph);
  });

  it("no-ops for an unknown node id, returning the same graph reference", () => {
    const result = toggleNodeCompletion(branchingGraph, "does-not-exist", now);
    expect(result).toBe(branchingGraph);
  });

  it("does not mutate other nodes", () => {
    const updated = toggleNodeCompletion(branchingGraph, "req-2a", now);
    const untouched = updated.nodes.find(
      (candidate) => candidate.id === "req-1",
    );
    expect(untouched?.done).toBe(true);
    expect(untouched?.completed_at).toBeUndefined();
  });

  it("advances next-actionable emphasis when the current next node completes", () => {
    const before = buildTaskMapCollapseView(branchingGraph);
    expect(before.nextActionableId).toBe("req-2b");

    const afterToggle = toggleNodeCompletion(branchingGraph, "req-2b", now);
    const after = buildTaskMapCollapseView(afterToggle);
    expect(after.nextActionableId).toBe("req-2b-2");
  });
});

describe("carryForwardNodeCompletion", () => {
  const previousGraph: TaskMapGraph = {
    nodes: [
      {
        id: "req-1",
        title: "Draft outline",
        role: "required",
        done: true,
        completed_at: "2026-07-10T09:00:00.000Z",
      },
      { id: "req-2", title: "Send it", role: "required", done: false },
    ],
    edges: [{ from: "req-1", to: "req-2" }],
  };

  it("returns the next graph unchanged when there is no previous graph", () => {
    const next: TaskMapGraph = {
      nodes: [{ id: "req-1", title: "Draft outline", role: "required" }],
      edges: [],
    };
    expect(carryForwardNodeCompletion(null, next)).toBe(next);
    expect(carryForwardNodeCompletion(undefined, next)).toBe(next);
  });

  it("survives: carries done/completed_at forward for a node whose id and role are unchanged", () => {
    const next: TaskMapGraph = {
      nodes: [
        { id: "req-1", title: "Draft outline (revised)", role: "required" },
        { id: "req-2", title: "Send it", role: "required" },
      ],
      edges: [{ from: "req-1", to: "req-2" }],
    };

    const result = carryForwardNodeCompletion(previousGraph, next);
    const req1 = result.nodes.find((node) => node.id === "req-1");
    const req2 = result.nodes.find((node) => node.id === "req-2");

    expect(req1?.done).toBe(true);
    expect(req1?.completed_at).toBe("2026-07-10T09:00:00.000Z");
    // Title revision survives untouched — only completion carries forward.
    expect(req1?.title).toBe("Draft outline (revised)");
    // req-2 was not complete in the previous graph, so it stays untouched.
    expect(req2?.done).toBeUndefined();
  });

  it("dropped: a completed node whose id does not appear in the next graph is simply gone", () => {
    const next: TaskMapGraph = {
      nodes: [{ id: "req-2", title: "Send it", role: "required" }],
      edges: [],
    };

    const result = carryForwardNodeCompletion(previousGraph, next);
    expect(result.nodes.map((node) => node.id)).toEqual(["req-2"]);
    expect(result.nodes[0]?.done).toBeUndefined();
  });

  it("renamed-id: a completed node whose id changed in the revision does not carry forward (no match)", () => {
    const next: TaskMapGraph = {
      nodes: [
        { id: "req-1-renamed", title: "Draft outline", role: "required" },
        { id: "req-2", title: "Send it", role: "required" },
      ],
      edges: [{ from: "req-1-renamed", to: "req-2" }],
    };

    const result = carryForwardNodeCompletion(previousGraph, next);
    const renamed = result.nodes.find((node) => node.id === "req-1-renamed");
    expect(renamed?.done).toBeUndefined();
    expect(renamed?.completed_at).toBeUndefined();
  });

  it("role-changed-to-red: a completed node whose new role is red never carries forward completion", () => {
    const next: TaskMapGraph = {
      nodes: [
        {
          id: "req-1",
          title: "Draft outline",
          role: "red",
          red_reason: "No longer a valid path.",
        },
        { id: "req-2", title: "Send it", role: "required" },
      ],
      edges: [],
    };

    const result = carryForwardNodeCompletion(previousGraph, next);
    const req1 = result.nodes.find((node) => node.id === "req-1");
    expect(req1?.done).toBeUndefined();
    expect(req1?.completed_at).toBeUndefined();
  });

  it("treats completed_at-only (no done flag) in the previous graph as complete for carry-forward", () => {
    const previousWithTimestampOnly: TaskMapGraph = {
      nodes: [
        {
          id: "req-1",
          title: "Draft outline",
          role: "required",
          completed_at: "2026-07-10T09:00:00.000Z",
        },
      ],
      edges: [],
    };
    const next: TaskMapGraph = {
      nodes: [{ id: "req-1", title: "Draft outline", role: "required" }],
      edges: [],
    };

    const result = carryForwardNodeCompletion(previousWithTimestampOnly, next);
    expect(result.nodes[0]?.done).toBe(true);
    expect(result.nodes[0]?.completed_at).toBe("2026-07-10T09:00:00.000Z");
  });

  it("returns the exact next graph reference when nothing carries forward", () => {
    const next: TaskMapGraph = {
      nodes: [{ id: "req-2", title: "Send it", role: "required" }],
      edges: [],
    };
    expect(carryForwardNodeCompletion(previousGraph, next)).toBe(next);
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
