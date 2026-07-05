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
  it("gives each count badge tabular-nums and a reserved width", () => {
    render(
      <PipelineOverview
        counts={{ capture: 0, triage: 3, plan: 1, execute: 0, review: 5 }}
        onDrill={() => {}}
      />,
    );

    const badge = screen.getByTestId("pipeline-overview-count-triage");
    expect(badge).toHaveClass("tabular-nums");
    expect(badge).toHaveClass("min-w-[2ch]");

    const zeroBadge = screen.getByTestId("pipeline-overview-count-execute");
    expect(zeroBadge).toHaveClass("tabular-nums");
    expect(zeroBadge).toHaveClass("min-w-[2ch]");
    expect(zeroBadge).toHaveTextContent("0");
  });
});
