import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProgressionRail } from "./ProgressionRail";
import type { ProgressionNode } from "./progressionNodes";

const NODES: ProgressionNode[] = [
  { id: "real-0", label: "Captured", status: "done", kind: "real" },
  { id: "real-1", label: "Triaged", status: "done", kind: "real" },
  { id: "real-2", label: "Planned", status: "current", kind: "real" },
  { id: "real-3", label: "In focus", status: "next", kind: "real" },
  { id: "real-4", label: "Done", status: "next", kind: "real" },
  {
    id: "speculative-breakdown",
    label: "Break it down further",
    status: "speculative",
    kind: "speculative",
  },
];

describe("ProgressionRail", () => {
  it("renders nothing when nodes is empty", () => {
    const { container } = render(<ProgressionRail nodes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed view shows the last done node, the current node, and fold affordances for both sides", () => {
    render(<ProgressionRail nodes={NODES} />);

    const rail = screen.getByTestId("progression-rail");
    expect(rail).toHaveAttribute("data-expanded", "false");

    // last done before the frontier (Triaged) + current (Planned)
    expect(screen.getByTestId("progression-node-real-1")).toBeInTheDocument();
    expect(screen.getByTestId("progression-node-real-2")).toBeInTheDocument();

    expect(screen.getByTestId("progression-rail-fold-done")).toHaveTextContent(
      "+1 done",
    );
    expect(screen.getByTestId("progression-rail-fold-steps")).toHaveTextContent(
      "+3 steps",
    );

    expect(
      screen.queryByTestId("progression-node-real-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("progression-node-real-3"),
    ).not.toBeInTheDocument();
  });

  it("expanding reveals the full chain and fires onExpand", () => {
    const onExpand = vi.fn();
    render(<ProgressionRail nodes={NODES} onExpand={onExpand} />);

    fireEvent.click(screen.getByTestId("progression-rail-fold-steps"));

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("progression-rail")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    for (const node of NODES) {
      expect(
        screen.getByTestId(`progression-node-${node.id}`),
      ).toBeInTheDocument();
    }
  });

  it("collapse toggles back to the folded view without calling onExpand again", () => {
    const onExpand = vi.fn();
    render(<ProgressionRail nodes={NODES} onExpand={onExpand} />);

    fireEvent.click(screen.getByTestId("progression-rail-fold-steps"));
    fireEvent.click(screen.getByTestId("progression-rail-collapse"));

    expect(screen.getByTestId("progression-rail")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("speculative node renders with a dashed/muted treatment", () => {
    render(<ProgressionRail nodes={NODES} />);
    fireEvent.click(screen.getByTestId("progression-rail-fold-steps"));

    const speculative = screen.getByTestId(
      "progression-node-speculative-breakdown",
    );
    expect(speculative.className).toMatch(/border-dashed/);
    expect(speculative.className).toMatch(/text-muted-foreground/);
  });

  it("aria-labels carry the textual status, not just color", () => {
    render(<ProgressionRail nodes={NODES} />);
    fireEvent.click(screen.getByTestId("progression-rail-fold-steps"));

    expect(screen.getByTestId("progression-node-real-0")).toHaveAttribute(
      "aria-label",
      "Captured: done",
    );
    expect(screen.getByTestId("progression-node-real-2")).toHaveAttribute(
      "aria-label",
      "Planned: in progress",
    );
    expect(screen.getByTestId("progression-node-real-3")).toHaveAttribute(
      "aria-label",
      "In focus: up next",
    );
    expect(
      screen.getByTestId("progression-node-speculative-breakdown"),
    ).toHaveAttribute(
      "aria-label",
      "Break it down further: possible next step, not yet available",
    );
  });

  // SP-3 numeric steadiness: the "+N done"/"+N steps" fold counters must not
  // jiggle as the count changes, so both render with tabular figures.
  it("renders the fold counters with tabular-nums", () => {
    render(<ProgressionRail nodes={NODES} />);

    expect(screen.getByTestId("progression-rail-fold-done")).toHaveClass(
      "tabular-nums",
    );
    expect(screen.getByTestId("progression-rail-fold-steps")).toHaveClass(
      "tabular-nums",
    );
  });

  it("all-done chain (no current/next node) collapses to last node with a leading fold and no trailing fold", () => {
    const allDone: ProgressionNode[] = [
      { id: "real-0", label: "Captured", status: "done", kind: "real" },
      { id: "real-1", label: "Triaged", status: "done", kind: "real" },
      {
        id: "speculative-breakdown",
        label: "Break it down further",
        status: "speculative",
        kind: "speculative",
      },
    ];

    render(<ProgressionRail nodes={allDone} />);

    expect(
      screen.queryByTestId("progression-rail-fold-steps"),
    ).not.toBeInTheDocument();
    // Frontier falls back to the trailing speculative node.
    expect(
      screen.getByTestId("progression-node-speculative-breakdown"),
    ).toBeInTheDocument();
  });

  // SP-9: the fold/collapse affordances reach a >=44px effective hit area
  // and drop the 300ms double-tap delay on coarse pointers.
  it("fold-steps and collapse buttons carry hit-area and touch-manipulation utilities", () => {
    render(<ProgressionRail nodes={NODES} />);

    const foldSteps = screen.getByTestId("progression-rail-fold-steps");
    expect(foldSteps).toHaveClass("min-h-[44px]");
    expect(foldSteps).toHaveClass("min-w-[44px]");
    expect(foldSteps).toHaveClass("touch-manipulation");

    fireEvent.click(foldSteps);

    const collapse = screen.getByTestId("progression-rail-collapse");
    expect(collapse).toHaveClass("min-h-[44px]");
    expect(collapse).toHaveClass("touch-manipulation");
  });
});
