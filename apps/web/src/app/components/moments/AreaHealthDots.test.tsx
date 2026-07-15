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

  // R5 (#483 round 5, blocker 2): the list used to render one row per area
  // with no cap, which made the Areas card's own height — and so the fixed
  // capture pill's clearance under it — scale with area count (R4-A measured
  // the demo seed's 4 areas clearing the pill by single-digit px at
  // 1366x768; a 5th area went negative). It's now a bounded internal scroll
  // pane. The binding truthfulness requirement: every area must still be in
  // the DOM — capping must never mean silently dropping an area the user
  // configured, only scrolling to see it.
  function buildAreas(count: number): AreaHealthVM[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `area-${index}`,
      name: `Area ${index}`,
      status: "ok" as const,
      note: "0 open",
      color: "#2563eb",
    }));
  }

  it("keeps every area in the DOM even when the list scrolls (never silently hides one)", () => {
    for (const count of [4, 5, 8, 12]) {
      const { unmount } = render(<AreaHealthDots areas={buildAreas(count)} />);
      for (let index = 0; index < count; index += 1) {
        expect(
          screen.getByTestId(`area-health-row-area-${index}`),
        ).toBeInTheDocument();
      }
      unmount();
    }
  });

  it("caps the list to a bounded scroll pane once area count exceeds the visible-row budget", () => {
    render(<AreaHealthDots areas={buildAreas(5)} />);
    const list = screen.getByTestId("area-health-dots");
    expect(list.className).toMatch(/\bmoments-rail-scroll\b/);
    expect(list.className).toMatch(/\boverflow-y-auto\b/);
  });

  it("does not cap or add any overflow affordance when area count is within the scroll threshold", () => {
    render(<AreaHealthDots areas={buildAreas(3)} />);
    const list = screen.getByTestId("area-health-dots");
    expect(list.className).not.toMatch(/\bmoments-rail-scroll\b/);
    expect(
      screen.queryByTestId("area-health-dots-overflow-hint"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("area-health-dots-fade"),
    ).not.toBeInTheDocument();
  });

  // Honest affordance, at zero extra layout height (a first version that
  // added a dedicated on-screen hint row cost more card height than a tight
  // cap saved, going net negative on the pill clearance this fix exists to
  // protect — see the R5 doc comment). Three parts once capped: (1) an
  // sr-only note (zero visual footprint) states the real count for screen
  // readers, (2) a decorative bottom fade signals "more below" without
  // adding layout height (absolutely positioned), (3) the real count also
  // surfaces in SideRail's card header (SideRail.test.tsx), which costs no
  // extra height since it reuses an existing text line.
  it("gives capped lists a zero-height overflow affordance: an sr-only count note and a decorative fade", () => {
    render(<AreaHealthDots areas={buildAreas(8)} />);

    const hint = screen.getByTestId("area-health-dots-overflow-hint");
    expect(hint.textContent).toContain("8");
    expect(hint.className).toMatch(/\bsr-only\b/);

    const fade = screen.getByTestId("area-health-dots-fade");
    expect(fade).toHaveAttribute("aria-hidden", "true");
    expect(fade.className).toMatch(/\babsolute\b/);
    expect(fade.className).toMatch(/\bpointer-events-none\b/);

    const wrap = screen.getByTestId("area-health-dots-wrap");
    const list = screen.getByTestId("area-health-dots");
    expect(wrap).toContainElement(hint);
    expect(wrap).toContainElement(fade);
    expect(list).not.toContainElement(hint);
    expect(list).not.toContainElement(fade);
  });
});
