import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AreaHealthDots } from "./AreaHealthDots";
import type { AreaHealthVM } from "./momentsViewModel";

const AREAS: AreaHealthVM[] = [
  { id: "a1", name: "Work", status: "ok", note: "3 open", color: "#2563eb" },
  {
    id: "a2",
    name: "Health",
    status: "watch",
    note: "1 waiting",
    color: "#16a34a",
  },
  {
    id: "a3",
    name: "Finance",
    status: "risk",
    note: "2 waiting",
    color: "#9333ea",
  },
  { id: "a4", name: "Home", status: "idle", note: "0 open", color: "#f97316" },
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

  // SP-8: the empty state names the filling action (adding an area in
  // Settings) instead of being a dead end, and avoids the banned dead-end
  // phrasing.
  it("empty state names adding an area in Settings as the filling action", () => {
    render(<AreaHealthDots areas={[]} />);
    const empty = screen.getByTestId("area-health-dots-empty");
    expect(empty).toHaveTextContent("add one in Settings");
    expect(empty.textContent?.toLowerCase()).not.toMatch(
      /nothing here|empty|no data|\bnone\b/,
    );
  });

  // D-4 (#483): restyled to prototype-2's row treatment — the status word
  // that previously only lived in the dot's aria-label is now visible text
  // too, still sourced from the same STATUS_LABEL map (no new data).
  it("shows the status word as visible text on each row, not just in aria-label", () => {
    render(<AreaHealthDots areas={AREAS} />);
    expect(screen.getByTestId("area-health-status-a1")).toHaveTextContent(
      "on track",
    );
    expect(screen.getByTestId("area-health-status-a3")).toHaveTextContent(
      "at risk",
    );
  });

  // D-11 (#483): each row carries its area's real identity swatch (from
  // AreaHealthVM.color, sourced from Phase2MockArea.color) via the existing
  // --area-accent token, distinct from the status dot's --state-* color.
  it("renders each area's identity swatch with its real color via --area-accent", () => {
    render(<AreaHealthDots areas={AREAS} />);
    expect(screen.getByTestId("area-health-swatch-a1")).toHaveStyle({
      "--area-accent": "#2563eb",
    });
    expect(screen.getByTestId("area-health-swatch-a3")).toHaveStyle({
      "--area-accent": "#9333ea",
    });
  });

  // The swatch is identity, not a status signal — it stays out of the
  // accessibility tree so screen readers get the status dot's aria-label
  // once per row, not twice.
  it("marks the identity swatch aria-hidden, leaving the status dot as the sole accessible signal", () => {
    render(<AreaHealthDots areas={AREAS} />);
    expect(screen.getByTestId("area-health-swatch-a1")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  // R2-C (#483 round 2, regression): D-11 rendered the identity swatch and
  // the status dot as two same-size circles (`rounded-full`) with nothing
  // separating them, which read as a duplication bug rather than
  // "identity + status". The swatch must now be a non-circular bar so the
  // two marks can never be confused for each other, even if they ever end
  // up adjacent again.
  it("renders the identity swatch as a non-circular bar, distinct in shape from the round status dot", () => {
    render(<AreaHealthDots areas={AREAS} />);
    const swatch = screen.getByTestId("area-health-swatch-a1");
    const dot = screen.getByTestId("area-health-dot-a1");
    expect(swatch.className).not.toMatch(/rounded-full/);
    expect(dot.className).toMatch(/rounded-full/);
  });

  // R2-C (#483 round 2, regression): the two marks must not be visual
  // neighbors — the status dot sits against the status word it labels
  // (opposite end of the row from the identity swatch), not beside the
  // identity swatch.
  it("keeps the status dot adjacent to the status word, not adjacent to the identity swatch", () => {
    render(<AreaHealthDots areas={AREAS} />);
    const dot = screen.getByTestId("area-health-dot-a1");
    const statusGroup = screen.getByTestId("area-health-status-a1");
    const swatch = screen.getByTestId("area-health-swatch-a1");

    // The dot lives inside the same group as the visible status word...
    expect(statusGroup).toContainElement(dot);
    expect(statusGroup).toHaveTextContent("on track");
    // ...and is not a sibling of the identity swatch.
    expect(swatch.parentElement).not.toContainElement(dot);
  });
});
