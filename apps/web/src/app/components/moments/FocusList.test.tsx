import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FocusList } from "./FocusList";
import type { FocusItemVM } from "./momentsViewModel";

function item(
  overrides: Partial<FocusItemVM> & { title: string },
): FocusItemVM {
  return {
    why: "Oldest active commitment",
    areaLabel: "Work",
    estMinutes: 25,
    taskId: null,
    ...overrides,
  };
}

describe("FocusList", () => {
  it("renders in-budget items without a deferred pill", () => {
    render(
      <FocusList
        items={[item({ title: "Write report", taskId: "t1" })]}
        deferred={[]}
      />,
    );
    expect(screen.getByText("Write report")).toBeInTheDocument();
    expect(
      screen.queryByTestId("focus-list-deferred-pill"),
    ).not.toBeInTheDocument();
  });

  it("renders deferred items visibly with a 'Deferred' pill, not hidden", () => {
    render(
      <FocusList
        items={[]}
        deferred={[item({ title: "Overflow task", taskId: "t2" })]}
      />,
    );
    expect(screen.getByText("Overflow task")).toBeInTheDocument();
    expect(screen.getByTestId("focus-list-deferred-pill")).toHaveTextContent(
      "Deferred",
    );
  });

  it("renders both in-budget and deferred items together, deferred after focus", () => {
    render(
      <FocusList
        items={[item({ title: "In budget", taskId: "t1" })]}
        deferred={[item({ title: "Deferred one", taskId: "t2" })]}
      />,
    );
    const rows = screen.getAllByTestId(/focus-list-(item|deferred-item)/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("In budget");
    expect(rows[1]).toHaveTextContent("Deferred one");
  });

  it("does not use red/risk styling for the deferred pill (calm treatment)", () => {
    render(
      <FocusList
        items={[]}
        deferred={[item({ title: "Overflow task", taskId: "t2" })]}
      />,
    );
    const pill = screen.getByTestId("focus-list-deferred-pill");
    expect(pill.getAttribute("style")).toContain("--state-idle");
    expect(pill.getAttribute("style")).not.toContain("--state-risk");
    expect(pill.getAttribute("style")).not.toContain("destructive");
  });

  it("renders nothing when both lists are empty", () => {
    const { container } = render(<FocusList items={[]} deferred={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to the why-reason label when areaLabel is empty", () => {
    render(
      <FocusList
        items={[item({ title: "No area task", areaLabel: "", why: "Next up" })]}
        deferred={[]}
      />,
    );
    expect(screen.getByText("Next up")).toBeInTheDocument();
  });
});
