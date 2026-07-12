import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CutScopeCandidates } from "./CutScopeCandidates";
import type { TaskMapNode } from "@/lib/taskmap/graph";

const candidates: TaskMapNode[] = [
  { id: "opt-1", title: "Add citations", role: "optional", done: false },
  { id: "opt-2", title: "Polish tone", role: "optional", done: false },
];

describe("CutScopeCandidates", () => {
  it("renders nothing when there are no candidates", () => {
    const { container } = render(
      <CutScopeCandidates candidates={[]} note="" onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByTestId("cut-scope-candidates"),
    ).not.toBeInTheDocument();
  });

  it("lists each not-yet-completed optional node as a tappable candidate", () => {
    render(
      <CutScopeCandidates candidates={candidates} note="" onSelect={vi.fn()} />,
    );

    expect(screen.getByTestId("cut-scope-candidates")).toBeInTheDocument();
    expect(
      screen.getByText("Ready-made cuts from your map"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cut-scope-candidate-opt-1")).toHaveTextContent(
      "Add citations",
    );
    expect(screen.getByTestId("cut-scope-candidate-opt-2")).toHaveTextContent(
      "Polish tone",
    );
  });

  it("calls onSelect with the tapped candidate", () => {
    const onSelect = vi.fn();
    render(
      <CutScopeCandidates
        candidates={candidates}
        note=""
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("cut-scope-candidate-opt-2"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(candidates[1]);
  });

  it("shows no note preview when nothing has been tapped yet", () => {
    render(
      <CutScopeCandidates candidates={candidates} note="" onSelect={vi.fn()} />,
    );

    expect(
      screen.queryByTestId("cut-scope-note-preview"),
    ).not.toBeInTheDocument();
  });

  it("shows a visible note preview and marks the tapped chip selected", () => {
    render(
      <CutScopeCandidates
        candidates={candidates}
        note="Add citations"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("cut-scope-note-preview")).toHaveTextContent(
      "Cut note: Add citations",
    );
    expect(screen.getByTestId("cut-scope-candidate-opt-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("cut-scope-candidate-opt-2")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
