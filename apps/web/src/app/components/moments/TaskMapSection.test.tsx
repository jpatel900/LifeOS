import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskMapSection } from "./TaskMapSection";
import type { ProgressionNode } from "./progressionNodes";

const NODES: ProgressionNode[] = [
  { id: "real-0", label: "Captured", status: "done", kind: "real" },
  { id: "real-1", label: "Triaged", status: "current", kind: "real" },
];

const approvedGraph = {
  schema_version: "1.0" as const,
  nodes: [
    {
      id: "req-1",
      title: "Draft outline",
      role: "required" as const,
      done: true,
    },
    { id: "req-2", title: "Send it", role: "required" as const, done: false },
  ],
  edges: [{ from: "req-1", to: "req-2" }],
};

describe("TaskMapSection", () => {
  it("renders the v0 rail plus a Draft map affordance when there is no approved map", () => {
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("progression-rail")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-draft-cta")).toHaveTextContent(
      "Draft map",
    );
  });

  it("renders TaskMapView instead of the rail when the task has an approved map", () => {
    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: approvedGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-view")).toBeInTheDocument();
    expect(screen.queryByTestId("progression-rail")).not.toBeInTheDocument();
  });

  it("shows a quiet pending state while a draft is in flight", () => {
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{ phase: "pending" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-draft-cta")).toHaveTextContent(
      "Drafting map…",
    );
    expect(screen.getByTestId("taskmap-draft-cta")).toBeDisabled();
  });

  it("shows a one-line non-blaming notice on degrade and stays on the rail", () => {
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{
          phase: "failed",
          message: "Couldn't draft a map right now.",
        }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("progression-rail")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-draft-notice")).toHaveTextContent(
      "Couldn't draft a map right now.",
    );
  });

  it("renders the draft review and calls onApproveDraft with the edited graph", () => {
    const onApproveDraft = vi.fn();
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{ phase: "ready", draft: approvedGraph }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={onApproveDraft}
      />,
    );

    expect(screen.getByTestId("taskmap-draft-review")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("taskmap-draft-approve"));
    expect(onApproveDraft).toHaveBeenCalledTimes(1);
  });

  it("clicking Draft map calls onRequestDraft", () => {
    const onRequestDraft = vi.fn();
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date()}
        onRequestDraft={onRequestDraft}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("taskmap-draft-cta"));
    expect(onRequestDraft).toHaveBeenCalledTimes(1);
  });

  it("no task (nothing focused) renders the rail without a Draft map affordance", () => {
    render(
      <TaskMapSection
        task={null}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("progression-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("taskmap-draft-cta")).not.toBeInTheDocument();
  });
});
