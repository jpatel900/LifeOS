import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoopOrientation } from "./LoopOrientation";
import { PIPELINE_OVERVIEW_STAGES } from "./pipelineCounts";

describe("LoopOrientation", () => {
  it("renders inside a bounded card, matching the moments-card treatment its siblings use", () => {
    render(<LoopOrientation />);

    const card = screen.getByTestId("start-loop-orientation");
    expect(card.className).toContain("moments-card");
  });

  it("renders every PIPELINE_OVERVIEW_STAGES entry, single-sourced (never a hardcoded stage list)", () => {
    render(<LoopOrientation />);

    for (const stage of PIPELINE_OVERVIEW_STAGES) {
      expect(
        screen.getByTestId(`start-loop-orientation-stage-${stage}`),
      ).toBeInTheDocument();
    }
  });

  it("renders stages in the same order as PIPELINE_OVERVIEW_STAGES", () => {
    render(<LoopOrientation />);

    const nodes = screen.getAllByTestId(/^start-loop-orientation-stage-/);
    expect(nodes.map((node) => node.dataset.testid)).toEqual(
      PIPELINE_OVERVIEW_STAGES.map(
        (stage) => `start-loop-orientation-stage-${stage}`,
      ),
    );
  });

  it("labels every node with a visible, non-empty caption (no bare numeral)", () => {
    render(<LoopOrientation />);

    for (const stage of PIPELINE_OVERVIEW_STAGES) {
      const node = screen.getByTestId(`start-loop-orientation-stage-${stage}`);
      expect(node.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("styles every node identically — no done/current/next visual distinction (nothing has moved through an empty loop)", () => {
    render(<LoopOrientation />);

    const badges = PIPELINE_OVERVIEW_STAGES.map((stage) =>
      screen
        .getByTestId(`start-loop-orientation-stage-${stage}`)
        .querySelector("span[aria-hidden]"),
    );

    const classNames = badges.map((badge) => badge?.className);
    expect(new Set(classNames).size).toBe(1);
  });

  it("carries no shame/urgency/gamified language and no exclamation marks", () => {
    render(<LoopOrientation />);

    const text = screen.getByTestId("start-loop-orientation").textContent ?? "";
    expect(text).not.toContain("!");
    expect(text.toLowerCase()).not.toMatch(
      /you failed|you didn't|blame|should have|let's go|great job|nice work/,
    );
  });

  it("carries an accessible label describing the loop, for screen-reader landmark navigation", () => {
    render(<LoopOrientation />);

    expect(
      screen.getByLabelText("How a captured thought moves through the loop"),
    ).toBeInTheDocument();
  });
});
