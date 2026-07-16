import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlowIdleOrientation } from "./FlowIdleOrientation";

describe("FlowIdleOrientation", () => {
  it("renders inside a bounded card, matching the moments-card treatment its siblings use", () => {
    render(<FlowIdleOrientation />);

    const card = screen.getByTestId("flow-idle-orientation");
    expect(card.className).toContain("moments-card");
    expect(card.className).toContain("workflow-support-card");
  });

  it("states what Flow is, in text visible to the accessibility tree", () => {
    render(<FlowIdleOrientation />);

    expect(screen.getByTestId("flow-idle-orientation")).toHaveTextContent(
      "one task",
    );
  });

  it("never repeats the 'go to Start' affordance already shown one card up", () => {
    render(<FlowIdleOrientation />);

    const text = screen.getByTestId("flow-idle-orientation").textContent ?? "";
    expect(text.toLowerCase()).not.toContain("start");
    expect(text).not.toContain("switches moments");
  });

  it("carries no shame/urgency language and no exclamation marks", () => {
    render(<FlowIdleOrientation />);

    const text = screen.getByTestId("flow-idle-orientation").textContent ?? "";
    expect(text).not.toContain("!");
    expect(text.toLowerCase()).not.toMatch(
      /you failed|you didn't|blame|should have|let's go|great job|nice work|hurry|now!/,
    );
  });

  it("never implies a block exists or was scheduled (no time/date/task-title language)", () => {
    render(<FlowIdleOrientation />);

    const text = screen.getByTestId("flow-idle-orientation").textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(
      /scheduled|starts at|starting|next up|upcoming/,
    );
  });
});
