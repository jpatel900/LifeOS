import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskMapView } from "./TaskMapView";
import type { TaskMapGraph } from "@/lib/taskmap/graph";

const graph: TaskMapGraph = {
  nodes: [
    { id: "req-1", title: "Draft outline", role: "required", done: true },
    { id: "req-2", title: "Write the report", role: "required", done: false },
    { id: "req-3", title: "Send it", role: "required", done: false },
    { id: "opt-1", title: "Polish formatting", role: "optional", done: false },
    {
      id: "red-1",
      title: "Do not send before legal review",
      role: "red",
      red_reason: "Compliance requires sign-off first.",
    },
  ],
  edges: [
    { from: "req-1", to: "req-2" },
    { from: "req-2", to: "req-3" },
  ],
};

describe("TaskMapView", () => {
  it("collapses to the critical path by default and emphasizes the next actionable node", () => {
    render(<TaskMapView graph={graph} mapApprovedAt={null} now={new Date()} />);

    expect(screen.getByTestId("taskmap-node-req-1")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-node-req-2")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-node-req-3")).toBeInTheDocument();
    expect(screen.queryByTestId("taskmap-node-opt-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("taskmap-node-red-1")).not.toBeInTheDocument();

    expect(screen.getByTestId("taskmap-expand")).toHaveTextContent("+2 more");
  });

  it("expand reveals optional/red nodes; red nodes are never actionable (no click handler, aria-disabled)", () => {
    render(<TaskMapView graph={graph} mapApprovedAt={null} now={new Date()} />);
    fireEvent.click(screen.getByTestId("taskmap-expand"));

    const optional = screen.getByTestId("taskmap-node-opt-1");
    expect(optional).toBeInTheDocument();

    const red = screen.getByTestId("taskmap-node-red-1");
    expect(red).toBeInTheDocument();
    expect(red.tagName).toBe("DIV");
    expect(red).toHaveAttribute("aria-disabled", "true");
    expect(red).toHaveTextContent("Compliance requires sign-off first.");
  });

  it("shows a subtle age label when mapApprovedAt is present", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const mapApprovedAt = new Date("2026-07-09T12:00:00.000Z").toISOString();
    render(
      <TaskMapView graph={graph} mapApprovedAt={mapApprovedAt} now={now} />,
    );

    expect(screen.getByTestId("taskmap-age-label")).toHaveTextContent(
      "Mapped 3 days ago",
    );
  });

  it("omits the age label when there is no approval timestamp", () => {
    render(<TaskMapView graph={graph} mapApprovedAt={null} now={new Date()} />);
    expect(screen.queryByTestId("taskmap-age-label")).not.toBeInTheDocument();
  });

  it("wires onToggleNodeCompletion to non-red chip clicks, including hidden ones", () => {
    const onToggle = vi.fn();
    render(
      <TaskMapView
        graph={graph}
        mapApprovedAt={null}
        now={new Date()}
        onToggleNodeCompletion={onToggle}
      />,
    );

    fireEvent.click(screen.getByTestId("taskmap-node-req-2"));
    expect(onToggle).toHaveBeenCalledWith("req-2");

    fireEvent.click(screen.getByTestId("taskmap-expand"));
    fireEvent.click(screen.getByTestId("taskmap-node-opt-1"));
    expect(onToggle).toHaveBeenCalledWith("opt-1");
  });

  it("keeps red nodes non-interactive even when onToggleNodeCompletion is provided", () => {
    const onToggle = vi.fn();
    render(
      <TaskMapView
        graph={graph}
        mapApprovedAt={null}
        now={new Date()}
        onToggleNodeCompletion={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId("taskmap-expand"));

    const red = screen.getByTestId("taskmap-node-red-1");
    expect(red.tagName).toBe("DIV");
    fireEvent.click(red);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("draws the critical path as connected edges by default (all accent-highlighted)", () => {
    render(<TaskMapView graph={graph} mapApprovedAt={null} now={new Date()} />);

    // req-1 -> req-2 -> req-3 are consecutive on the critical path, so both
    // edges render and both are marked critical.
    const edges = screen.getAllByTestId(/^taskmap-edge-/);
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge).toHaveAttribute("data-edge", "true");
      expect(edge).toHaveAttribute("data-critical", "true");
      // Accent stroke, not the muted border stroke.
      expect(edge.getAttribute("stroke")).toBe("var(--acc)");
    }
    // The connecting path from req-1 is drawn.
    expect(screen.getByTestId("taskmap-edge-req-1-req-2")).toBeInTheDocument();
  });

  it("expanded full graph draws every visible edge and distinguishes off-path edges from the critical path", () => {
    const branchGraph: TaskMapGraph = {
      nodes: [
        { id: "r1", title: "Start", role: "required", done: false },
        { id: "r2", title: "Middle", role: "required", done: false },
        { id: "r3", title: "End", role: "required", done: false },
        { id: "o1", title: "Side quest", role: "optional", done: false },
      ],
      edges: [
        { from: "r1", to: "r2" },
        { from: "r2", to: "r3" },
        { from: "r1", to: "o1" }, // off the critical path
      ],
    };

    render(
      <TaskMapView graph={branchGraph} mapApprovedAt={null} now={new Date()} />,
    );

    // Collapsed: only the two critical edges among visible (critical) nodes;
    // the r1 -> o1 edge is hidden because o1 is not on the critical path.
    expect(screen.getAllByTestId(/^taskmap-edge-/)).toHaveLength(2);
    expect(screen.queryByTestId("taskmap-edge-r1-o1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("taskmap-expand"));

    // Expanded: the full DAG — all three edges are drawn, o1 kept in its
    // dependency position rather than a flat list.
    const edges = screen.getAllByTestId(/^taskmap-edge-/);
    expect(edges).toHaveLength(3);

    const critical = screen.getByTestId("taskmap-edge-r1-r2");
    expect(critical).toHaveAttribute("data-critical", "true");
    expect(critical.getAttribute("stroke")).toBe("var(--acc)");

    const offPath = screen.getByTestId("taskmap-edge-r1-o1");
    expect(offPath).toHaveAttribute("data-critical", "false");
    expect(offPath.getAttribute("stroke")).toBe("var(--border)");

    expect(screen.getByTestId("taskmap-node-o1")).toBeInTheDocument();
  });

  it("degrades to a plain chip list (no drawn edges) when the graph is invalid", () => {
    const cyclicGraph: TaskMapGraph = {
      nodes: [
        { id: "a", title: "A", role: "required", done: false },
        { id: "b", title: "B", role: "required", done: false },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" }, // cycle -> validateGraph fails
      ],
    };

    render(
      <TaskMapView graph={cyclicGraph} mapApprovedAt={null} now={new Date()} />,
    );

    expect(screen.getByTestId("taskmap-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("taskmap-edge-layer")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^taskmap-edge-/)).toHaveLength(0);
    // Nodes still render as chips so the surface is never a dead end.
    expect(screen.getByTestId("taskmap-node-a")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-node-b")).toBeInTheDocument();
  });
});
