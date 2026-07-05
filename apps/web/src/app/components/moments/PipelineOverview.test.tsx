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
});
