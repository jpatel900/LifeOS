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
});
