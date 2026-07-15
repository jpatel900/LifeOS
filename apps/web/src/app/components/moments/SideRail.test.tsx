import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideRail } from "./SideRail";
import type { AreaHealthVM, WaitingVM } from "./momentsViewModel";

const AREAS: AreaHealthVM[] = [
  { id: "a1", name: "Work", status: "ok", note: "3 open", color: "#2563eb" },
];

const WAITING: WaitingVM[] = [
  {
    taskId: "t1",
    title: "Contract redline",
    since: "2026-06-27T09:00:00.000Z",
    daysWaiting: 8,
    status: "risk",
  },
];

describe("SideRail", () => {
  it("shows a truthful, calm empty state for waiting-on", () => {
    render(<SideRail waitingOn={[]} areas={AREAS} onOpenHealth={vi.fn()} />);
    expect(screen.getByTestId("side-rail-waiting-empty")).toHaveTextContent(
      "Nothing waiting on anyone.",
    );
  });

  it("renders waiting entries when present", () => {
    render(
      <SideRail waitingOn={WAITING} areas={AREAS} onOpenHealth={vi.fn()} />,
    );
    expect(screen.getByText("Contract redline")).toBeInTheDocument();
    expect(screen.getByText("8d")).toBeInTheDocument();
  });

  it("calls onOpenHealth when the areas link is clicked", () => {
    const onOpenHealth = vi.fn();
    render(
      <SideRail waitingOn={[]} areas={AREAS} onOpenHealth={onOpenHealth} />,
    );
    fireEvent.click(screen.getByTestId("side-rail-open-health"));
    expect(onOpenHealth).toHaveBeenCalledTimes(1);
  });

  // SP-3 numeric steadiness: the days-waiting figure must not jiggle as it
  // changes, so it renders with tabular figures.
  it("renders the days-waiting figure with tabular-nums", () => {
    render(
      <SideRail waitingOn={WAITING} areas={AREAS} onOpenHealth={vi.fn()} />,
    );
    expect(screen.getByText("8d")).toHaveClass("tabular-nums");
  });

  // SP-8: the waiting-empty state names the filling action (marking a task
  // as waiting during triage) instead of being a dead end, and avoids the
  // banned dead-end phrasing.
  it("waiting-empty state names marking a task as waiting as the filling action", () => {
    render(<SideRail waitingOn={[]} areas={AREAS} onOpenHealth={vi.fn()} />);
    const empty = screen.getByTestId("side-rail-waiting-empty");
    expect(empty).toHaveTextContent("Mark a task as waiting");
    expect(empty.textContent?.toLowerCase()).not.toMatch(
      /nothing here|empty|no data|\bnone\b/,
    );
  });

  // SP-9: the "View area health" affordance reaches a >=44px effective
  // hit area and drops the 300ms double-tap delay on coarse pointers.
  it("open-health button carries hit-area and touch-manipulation utilities", () => {
    render(<SideRail waitingOn={[]} areas={AREAS} onOpenHealth={vi.fn()} />);
    const button = screen.getByTestId("side-rail-open-health");
    expect(button).toHaveClass("min-h-[44px]");
    expect(button).toHaveClass("touch-manipulation");
  });

  // D-4 (#483): the day-count carries a length-encoded age bar (bucket ->
  // fill width) alongside its color, so the aging ramp survives without
  // color as well as with it — no fabricated per-day scale, just the same
  // ok/watch/risk bucket rendered twice.
  it("renders a length-encoded age bar per waiting-on row, keyed to its bucket", () => {
    render(
      <SideRail waitingOn={WAITING} areas={AREAS} onOpenHealth={vi.fn()} />,
    );
    const row = screen.getByTestId("side-rail-waiting-row-t1");
    const bar = row.querySelector("span > span") as HTMLElement | null;
    expect(bar).not.toBeNull();
  });

  // D-4 (#483): restyled rows keep the task title as the row's single line —
  // no fabricated person name/avatar (no people store backs `WaitingVM`).
  it("waiting rows show only the task title, no avatar or person name", () => {
    render(
      <SideRail waitingOn={WAITING} areas={AREAS} onOpenHealth={vi.fn()} />,
    );
    expect(
      screen.queryByRole("img", { name: /contract redline/i }),
    ).not.toBeInTheDocument();
  });
});
