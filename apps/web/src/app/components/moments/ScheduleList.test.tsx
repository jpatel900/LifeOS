import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleList } from "./ScheduleList";
import { formatClock } from "./formatTime";
import type { ScheduleBlockVM } from "./momentsViewModel";

const NOW = new Date("2026-07-05T15:00:00.000Z");

const BLOCKS: ScheduleBlockVM[] = [
  {
    id: "done-1",
    title: "Morning standup",
    meta: "Work",
    state: "done",
    startAt: "2026-07-05T13:00:00.000Z",
    endAt: "2026-07-05T13:15:00.000Z",
  },
  {
    id: "now-1",
    title: "Deep work block",
    meta: "Work",
    state: "now",
    startAt: "2026-07-05T14:30:00.000Z",
    endAt: "2026-07-05T15:30:00.000Z",
  },
  {
    id: "free-1",
    title: "",
    meta: "",
    state: "free",
    startAt: "2026-07-05T15:30:00.000Z",
    endAt: "2026-07-05T16:00:00.000Z",
  },
  {
    id: "upcoming-1",
    title: "1:1 with Priya",
    meta: "Work",
    state: "upcoming",
    startAt: "2026-07-05T16:00:00.000Z",
    endAt: "2026-07-05T16:30:00.000Z",
  },
];

describe("ScheduleList", () => {
  it("marks done rows with a strikethrough/muted title", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const doneRow = screen.getByText("Morning standup");
    expect(doneRow.className).toContain("line-through");
  });

  it("shows a remaining-time pill for the now row", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="countdown" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const nowRow = rows.find((row) => row.getAttribute("data-state") === "now");
    expect(nowRow).toBeDefined();
    expect(nowRow!.textContent).toMatch(/30m left/);
  });

  it("shows a Free pill for free rows", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("renders countdown labels for upcoming rows in countdown mode", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="countdown" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const upcomingRow = rows.find(
      (row) => row.getAttribute("data-state") === "upcoming",
    );
    expect(upcomingRow!.textContent).toMatch(/in 1h/);
  });

  it("renders wall-clock labels in clock mode", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const upcomingRow = rows.find(
      (row) => row.getAttribute("data-state") === "upcoming",
    );
    // Wall clock format varies by locale but should not contain "in "/"left".
    expect(upcomingRow!.textContent).not.toMatch(/in 1h|left/);
  });

  it("renders an empty state with no blocks", () => {
    render(<ScheduleList blocks={[]} timeDisplay="clock" now={NOW} />);
    expect(screen.getByTestId("schedule-list-empty")).toBeInTheDocument();
  });

  // SP-7: locks the ScheduleBlock -> formatTime.formatClock refactor. The
  // rendered clock label must stay byte-identical to formatClock's own
  // output for the same ISO input (this was true before the refactor too,
  // since the inline helper used the identical toLocaleTimeString call).
  it("renders the exact formatClock output for a done row's wall-clock label", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const doneRow = rows.find(
      (row) => row.getAttribute("data-state") === "done",
    );
    expect(doneRow!.textContent).toContain(formatClock(BLOCKS[0].startAt));
  });

  // SP-3 numeric steadiness: the now-row's remaining-time pill and the
  // upcoming-row's countdown label must not jiggle, so both render with
  // tabular figures.
  it("renders the now pill and upcoming countdown label with tabular-nums", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="countdown" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");

    const nowRow = rows.find((row) => row.getAttribute("data-state") === "now");
    const nowPill = nowRow!.querySelector(
      '[data-testid="schedule-block-pill"]',
    );
    expect(nowPill).toHaveClass("tabular-nums");

    const upcomingRow = rows.find(
      (row) => row.getAttribute("data-state") === "upcoming",
    );
    const label = upcomingRow!.querySelector(
      ".shrink-0 span.text-xs.text-muted-foreground",
    );
    expect(label).toHaveClass("tabular-nums");
  });
});
