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

  // FR-031 slice F2 (#664): deterministic timeline summary.
  it("shows no timeline summary for a 1.0 map with no durations", () => {
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

    expect(
      screen.queryByTestId("taskmap-timeline-summary"),
    ).not.toBeInTheDocument();
  });

  it("shows the remaining estimate and ETA for a 1.1 map with durations", () => {
    const timedGraph = {
      schema_version: "1.1" as const,
      nodes: [
        {
          id: "req-1",
          title: "Draft outline",
          role: "required" as const,
          done: true,
          estimated_minutes: 30,
        },
        {
          id: "req-2",
          title: "Send it",
          role: "required" as const,
          done: false,
          estimated_minutes: 45,
        },
      ],
      edges: [{ from: "req-1", to: "req-2" }],
    };

    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: timedGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date("2026-07-17T09:00:00.000Z")}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("taskmap-timeline-summary");
    // Done node (30m) excluded; remaining is req-2's 45m.
    expect(summary).toHaveTextContent("~45m left on the critical path");
    expect(summary).toHaveTextContent("about");
    expect(summary).not.toHaveTextContent("unestimated");
  });

  it("marks the estimate partial when only some nodes carry durations", () => {
    const partialGraph = {
      schema_version: "1.1" as const,
      nodes: [
        {
          id: "req-1",
          title: "Draft outline",
          role: "required" as const,
          estimated_minutes: 30,
        },
        { id: "req-2", title: "Send it", role: "required" as const },
      ],
      edges: [{ from: "req-1", to: "req-2" }],
    };

    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: partialGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date("2026-07-17T09:00:00.000Z")}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-timeline-summary")).toHaveTextContent(
      "some steps unestimated",
    );
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
    const notice = screen.getByTestId("taskmap-draft-notice");
    expect(notice).toHaveTextContent("Couldn't draft a map right now.");
    // Block-level on its own line, never jammed inline against the trigger.
    expect(notice.tagName).toBe("P");
    expect(notice.parentElement?.className).toMatch(/grid/);
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

  it("wires onToggleNodeCompletion through to the approved TaskMapView", () => {
    const onToggleNodeCompletion = vi.fn();
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
        onToggleNodeCompletion={onToggleNodeCompletion}
      />,
    );

    fireEvent.click(screen.getByTestId("taskmap-node-req-2"));
    expect(onToggleNodeCompletion).toHaveBeenCalledWith("req-2");
  });

  it("shows a Revise map affordance on the approved map view and wires it to onRequestDraft", () => {
    const onRequestDraft = vi.fn();
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
        onRequestDraft={onRequestDraft}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-view")).toBeInTheDocument();
    const button = screen.getByTestId("taskmap-revise-cta");
    expect(button).toHaveTextContent("Revise map");
    fireEvent.click(button);
    expect(onRequestDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps the approved map visible (not the rail) while a regen is pending", () => {
    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: approvedGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "pending" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-view")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-revise-cta")).toHaveTextContent(
      "Revising map…",
    );
    expect(screen.getByTestId("taskmap-revise-cta")).toBeDisabled();
  });

  it("keeps the approved map visible and shows a notice when a regen fails", () => {
    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: approvedGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "failed", message: "Couldn't revise the map." }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-view")).toBeInTheDocument();
    expect(screen.getByTestId("taskmap-revise-notice")).toHaveTextContent(
      "Couldn't revise the map.",
    );
  });

  it("replaces the approved map with the draft review, marked as a revision, when the regen draft is ready", () => {
    render(
      <TaskMapSection
        task={{
          id: "task-1",
          progression_map: approvedGraph,
          map_status: "approved",
          map_approved_at: null,
        }}
        progressionNodes={NODES}
        draftState={{ phase: "ready", draft: approvedGraph }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-draft-review")).toBeInTheDocument();
    expect(screen.queryByTestId("taskmap-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("taskmap-draft-approve")).toHaveTextContent(
      "Replace the map",
    );
    expect(screen.getByTestId("taskmap-draft-dismiss")).toHaveTextContent(
      "Keep current map",
    );
  });

  // FR-031 slice F5 (#679) — post-node-completion revision offer.
  it("renders the revision offer card under the approved map only while the draft state is idle", () => {
    const onPropose = vi.fn();
    const offerProps = {
      task: {
        id: "task-1",
        progression_map: approvedGraph,
        map_status: "approved" as const,
        map_approved_at: null,
      },
      progressionNodes: NODES,
      now: new Date(),
      onRequestDraft: vi.fn(),
      onDismissDraft: vi.fn(),
      onApproveDraft: vi.fn(),
      revisionOffer: {
        signals: [
          {
            kind: "cut_scope" as const,
            detail: "You trimmed what this task needs to finish.",
          },
        ],
      },
      onProposeRevision: onPropose,
      onDismissRevisionOffer: vi.fn(),
    };

    const { rerender } = render(
      <TaskMapSection {...offerProps} draftState={{ phase: "idle" }} />,
    );
    expect(screen.getByTestId("taskmap-revision-offer")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("taskmap-revision-offer-propose"));
    expect(onPropose).toHaveBeenCalledTimes(1);

    // A pending round-trip hides the card (no double surface).
    rerender(
      <TaskMapSection {...offerProps} draftState={{ phase: "pending" }} />,
    );
    expect(
      screen.queryByTestId("taskmap-revision-offer"),
    ).not.toBeInTheDocument();
  });

  it("never renders the revision offer without an approved map", () => {
    render(
      <TaskMapSection
        task={{ id: "task-1", progression_map: null, map_status: null }}
        progressionNodes={NODES}
        draftState={{ phase: "idle" }}
        now={new Date()}
        onRequestDraft={vi.fn()}
        onDismissDraft={vi.fn()}
        onApproveDraft={vi.fn()}
        revisionOffer={{
          signals: [{ kind: "blocker", detail: "A session ended stuck." }],
        }}
        onProposeRevision={vi.fn()}
        onDismissRevisionOffer={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("taskmap-revision-offer"),
    ).not.toBeInTheDocument();
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
