import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideRail } from "./SideRail";
import type { AreaHealthVM, WaitingVM } from "./momentsViewModel";

const AREAS: AreaHealthVM[] = [
  { id: "a1", name: "Work", status: "ok", note: "3 open" },
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
});
