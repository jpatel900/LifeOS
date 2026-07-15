import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineOverview } from "./PipelineOverview";

describe("PipelineOverview", () => {
  it("renders a label + count badge for each of the five pipeline stages", () => {
    render(
      <PipelineOverview
        counts={{
          capture: 2,
          triage: 3,
          plan: 1,
          execute: 0,
          review: 5,
        }}
        onDrill={() => {}}
      />,
    );

    expect(
      screen.getByTestId("pipeline-overview-count-capture"),
    ).toHaveTextContent("2");
    expect(
      screen.getByTestId("pipeline-overview-count-triage"),
    ).toHaveTextContent("3");
    expect(
      screen.getByTestId("pipeline-overview-count-plan"),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId("pipeline-overview-count-execute"),
    ).toHaveTextContent("0");
    expect(
      screen.getByTestId("pipeline-overview-count-review"),
    ).toHaveTextContent("5");
  });

  it("defaults a missing stage count to 0", () => {
    render(<PipelineOverview counts={{}} onDrill={() => {}} />);
    expect(
      screen.getByTestId("pipeline-overview-count-triage"),
    ).toHaveTextContent("0");
  });

  it("fires onDrill with the stage key when a node is clicked", () => {
    const onDrill = vi.fn();
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={onDrill}
      />,
    );

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-triage"));
    expect(onDrill).toHaveBeenCalledWith("triage");

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));
    expect(onDrill).toHaveBeenCalledWith("plan");
  });

  // SP-3 numeric steadiness: count badges use tabular figures and reserve a
  // stable width so a 9->10 digit rollover never shifts sibling nodes, and a
  // zero count still renders a stable "0" rather than collapsing the badge.
  //
  // D-9 (#483): digits also carry `lining-nums` alongside `tabular-nums` —
  // both compose into the element's `font-variant-numeric` — so the glyphs
  // read as deliberate, aligned figures rather than default proportional
  // text rendering.
  it("gives each count badge tabular-nums, lining-nums, and a reserved width", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 3, plan: 1, execute: 0, review: 5 }}
        onDrill={() => {}}
      />,
    );

    const badge = screen.getByTestId("pipeline-overview-count-triage");
    expect(badge).toHaveClass("tabular-nums");
    expect(badge).toHaveClass("lining-nums");
    expect(badge).toHaveClass("min-w-[2ch]");

    const zeroBadge = screen.getByTestId("pipeline-overview-count-execute");
    expect(zeroBadge).toHaveClass("tabular-nums");
    expect(zeroBadge).toHaveClass("lining-nums");
    expect(zeroBadge).toHaveClass("min-w-[2ch]");
    expect(zeroBadge).toHaveTextContent("0");
  });

  // SP-9: each stage node reaches a >=44px effective hit area and drops
  // the 300ms double-tap delay on coarse pointers.
  it("stage nodes carry hit-area and touch-manipulation utilities", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );
    const node = screen.getByTestId("pipeline-overview-stage-triage");
    expect(node).toHaveClass("min-h-[44px]");
    expect(node).toHaveClass("touch-manipulation");
  });

  // D-9 (#483): clicking a stage marks it `aria-current="step"` (and only
  // that stage) — the semantic, non-visual-string way to assert the
  // active-step state a sighted user sees as the accent-tinted node.
  it("marks exactly the clicked stage aria-current=step and clears the rest", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );

    for (const stage of ["capture", "triage", "plan", "execute", "review"]) {
      expect(
        screen.getByTestId(`pipeline-overview-stage-${stage}`),
      ).not.toHaveAttribute("aria-current");
    }

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-plan"));
    expect(
      screen.getByTestId("pipeline-overview-stage-plan"),
    ).toHaveAttribute("aria-current", "step");
    for (const stage of ["capture", "triage", "execute", "review"]) {
      expect(
        screen.getByTestId(`pipeline-overview-stage-${stage}`),
      ).not.toHaveAttribute("aria-current");
    }

    fireEvent.click(screen.getByTestId("pipeline-overview-stage-review"));
    expect(
      screen.getByTestId("pipeline-overview-stage-review"),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByTestId("pipeline-overview-stage-plan"),
    ).not.toHaveAttribute("aria-current");
  });

  // D-9 (#483): the rail renders as one composed strip — a decorative
  // chevron sits between each pair of stages (4 separators for 5 stages),
  // hidden from assistive tech since it carries no information beyond the
  // visual joint between nodes.
  it("renders a decorative chevron between each pair of stages", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 0, plan: 0, execute: 0, review: 0 }}
        onDrill={() => {}}
      />,
    );

    const rail = screen.getByTestId("pipeline-overview");
    const chevrons = Array.from(rail.querySelectorAll('[aria-hidden="true"]'));
    expect(chevrons).toHaveLength(4);
    for (const chevron of chevrons) {
      expect(chevron).toHaveTextContent("›");
    }
  });
});
