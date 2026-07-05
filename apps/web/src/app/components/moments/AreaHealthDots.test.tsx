import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AreaHealthDots } from "./AreaHealthDots";
import type { AreaHealthVM } from "./momentsViewModel";

const AREAS: AreaHealthVM[] = [
  { id: "a1", name: "Work", status: "ok", note: "3 open" },
  { id: "a2", name: "Health", status: "watch", note: "1 waiting" },
  { id: "a3", name: "Finance", status: "risk", note: "2 waiting" },
  { id: "a4", name: "Home", status: "idle", note: "0 open" },
];

describe("AreaHealthDots", () => {
  it("carries textual status and note in aria-label, not just color", () => {
    render(<AreaHealthDots areas={AREAS} />);

    expect(screen.getByTestId("area-health-dot-a1")).toHaveAttribute(
      "aria-label",
      "Work: on track — 3 open",
    );
    expect(screen.getByTestId("area-health-dot-a2")).toHaveAttribute(
      "aria-label",
      "Health: needs attention — 1 waiting",
    );
    expect(screen.getByTestId("area-health-dot-a3")).toHaveAttribute(
      "aria-label",
      "Finance: at risk — 2 waiting",
    );
    expect(screen.getByTestId("area-health-dot-a4")).toHaveAttribute(
      "aria-label",
      "Home: idle — 0 open",
    );
  });

  it("renders an empty state with no areas", () => {
    render(<AreaHealthDots areas={[]} />);
    expect(screen.getByTestId("area-health-dots-empty")).toBeInTheDocument();
  });
});
