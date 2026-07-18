import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskMapDraftReview } from "./TaskMapDraftReview";
import type { TaskMapGraph } from "@/lib/taskmap/graph";

const draft: TaskMapGraph & { schema_version: "1.0" } = {
  schema_version: "1.0",
  nodes: [
    { id: "req-1", title: "Draft outline", role: "required" },
    { id: "req-2", title: "Write the report", role: "required" },
    { id: "opt-1", title: "Polish formatting", role: "optional" },
    {
      id: "red-1",
      title: "Do not send early",
      role: "red",
      red_reason: "Needs legal sign-off first.",
    },
  ],
  edges: [{ from: "req-1", to: "req-2" }],
};

describe("TaskMapDraftReview", () => {
  it("renders exactly one representation per node with role-distinct treatment", () => {
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    // Non-red nodes render a single chip-styled editable input — no
    // duplicate read-only chip above it.
    const requiredInput = screen.getByTestId("taskmap-draft-edit-req-1");
    expect(requiredInput).toHaveAttribute("data-role", "required");
    expect(screen.queryByTestId("taskmap-node-req-1")).not.toBeInTheDocument();

    const optionalInput = screen.getByTestId("taskmap-draft-edit-opt-1");
    expect(optionalInput).toHaveAttribute("data-role", "optional");
    expect(optionalInput.className).toMatch(/border-dashed/);
    expect(optionalInput.className).toMatch(/text-muted-foreground/);
    expect(screen.queryByTestId("taskmap-node-opt-1")).not.toBeInTheDocument();

    // Red nodes keep the shared read-only chip (never editable).
    const red = screen.getByTestId("taskmap-node-red-1");
    expect(red).toHaveAttribute("data-role", "red");
    expect(red).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a start-here affordance only on the flagged two-minute-move node (FR-023)", () => {
    const flaggedDraft: TaskMapGraph & { schema_version: "1.0" } = {
      ...draft,
      nodes: [
        { ...draft.nodes[0], two_minute_move: true },
        ...draft.nodes.slice(1),
      ],
    };
    render(
      <TaskMapDraftReview
        draft={flaggedDraft}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("taskmap-draft-first-step-req-1"),
    ).toHaveTextContent(/start here/i);
    expect(
      screen.queryByTestId("taskmap-draft-first-step-req-2"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("taskmap-draft-edit-req-1")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("start here"),
    );
  });

  it("editable inputs take the full column width (no title clipping)", () => {
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-draft-edit-req-1")).toHaveClass(
      "w-full",
    );
  });

  it("red nodes have no editable title field (never actionable)", () => {
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("taskmap-draft-edit-red-1"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("taskmap-draft-edit-req-1")).toBeInTheDocument();
  });

  it("editing a title updates the node before approve", () => {
    const onApprove = vi.fn();
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={onApprove}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("taskmap-draft-edit-req-1"), {
      target: { value: "Draft the outline first" },
    });
    fireEvent.click(screen.getByTestId("taskmap-draft-approve"));

    expect(onApprove).toHaveBeenCalledTimes(1);
    const approved = onApprove.mock.calls[0][0] as TaskMapGraph;
    const edited = approved.nodes.find((node) => node.id === "req-1");
    expect(edited?.title).toBe("Draft the outline first");
  });

  it("removing a node also drops its edges, and approve calls onApprove with the edited graph", () => {
    const onApprove = vi.fn();
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={onApprove}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("taskmap-draft-remove-opt-1"));
    expect(
      screen.queryByTestId("taskmap-draft-edit-opt-1"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("taskmap-draft-approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);
    const approved = onApprove.mock.calls[0][0] as TaskMapGraph;
    expect(approved.nodes.some((node) => node.id === "opt-1")).toBe(false);
  });

  it("adding a step includes it in the approved graph", () => {
    const onApprove = vi.fn();
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={onApprove}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("taskmap-draft-add-input"), {
      target: { value: "Extra optional step" },
    });
    fireEvent.click(screen.getByTestId("taskmap-draft-add"));
    fireEvent.click(screen.getByTestId("taskmap-draft-approve"));

    expect(onApprove).toHaveBeenCalledTimes(1);
    const approved = onApprove.mock.calls[0][0] as TaskMapGraph;
    expect(
      approved.nodes.some((node) => node.title === "Extra optional step"),
    ).toBe(true);
  });

  it("dismiss calls onDismiss and never onApprove", () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={onApprove}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByTestId("taskmap-draft-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("starts with approve enabled and no errors for a valid draft", () => {
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId("taskmap-draft-approve")).not.toBeDisabled();
    expect(
      screen.queryByTestId("taskmap-draft-errors"),
    ).not.toBeInTheDocument();
  });

  it("disables approve and shows errors when adding steps exceeds the optional-node cap", () => {
    const onApprove = vi.fn();
    render(
      <TaskMapDraftReview
        draft={draft}
        onApprove={onApprove}
        onDismiss={vi.fn()}
      />,
    );

    // draft already has 1 optional node; the cap is 4, so 4 more tips it over.
    for (let i = 0; i < 4; i += 1) {
      fireEvent.change(screen.getByTestId("taskmap-draft-add-input"), {
        target: { value: `Extra step ${i}` },
      });
      fireEvent.click(screen.getByTestId("taskmap-draft-add"));
    }

    expect(screen.getByTestId("taskmap-draft-errors")).toHaveTextContent(
      /optional/i,
    );
    expect(screen.getByTestId("taskmap-draft-approve")).toBeDisabled();
    fireEvent.click(screen.getByTestId("taskmap-draft-approve"));
    expect(onApprove).not.toHaveBeenCalled();
  });
});
