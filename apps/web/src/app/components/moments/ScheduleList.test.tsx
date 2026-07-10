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

  // SP-8: the empty state names the filling action (plan a block) instead
  // of being a dead end, and avoids the banned dead-end phrasing.
  it("empty state names planning a block as the filling action", () => {
    render(<ScheduleList blocks={[]} timeDisplay="clock" now={NOW} />);
    const empty = screen.getByTestId("schedule-list-empty");
    expect(empty).toHaveTextContent("plan a block");
    expect(empty.textContent?.toLowerCase()).not.toMatch(
      /nothing here|empty|no data|\bnone\b/,
    );
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

  // D-5 (#483): the now row gets the "protected block" accent treatment
  // (area-accent-card's stronger gradient/shadow variant) plus aria-current,
  // so assistive tech and sighted users both get an unambiguous "this one is
  // active right now" signal.
  it("marks the now row aria-current and with the strong accent-card variant", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const nowRow = rows.find((row) => row.getAttribute("data-state") === "now");

    expect(nowRow).toHaveAttribute("aria-current", "true");
    expect(nowRow).toHaveAttribute("data-accent-strength", "strong");
    expect(nowRow!.className).toContain("area-accent-card");
  });

  it("does not mark done/upcoming/free rows aria-current or strong-accented", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");
    const nonNowRows = rows.filter(
      (row) => row.getAttribute("data-state") !== "now",
    );

    for (const row of nonNowRows) {
      expect(row).not.toHaveAttribute("aria-current");
      expect(row).not.toHaveAttribute("data-accent-strength");
    }
  });

  // D-5 (#483): a left status dot renders for every row (real, non-fabricated
  // state — the same `block.state` the strikethrough/tint/pill already key
  // off of), and it stays decorative (aria-hidden) since the sr-only prefix
  // below carries the accessible copy of the same signal.
  it("renders an aria-hidden status dot for every row", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const dots = screen.getAllByTestId("schedule-block-dot");
    expect(dots).toHaveLength(BLOCKS.length);
    for (const dot of dots) {
      expect(dot).toHaveAttribute("aria-hidden", "true");
    }
  });

  // D-5 (#483): screen readers get an explicit "Completed"/"Now" prefix on
  // done/now rows — today that state is conveyed only by strikethrough and
  // background tint, neither of which reaches assistive tech.
  it("gives done/now rows an sr-only state prefix, and leaves upcoming/free rows unprefixed", () => {
    render(<ScheduleList blocks={BLOCKS} timeDisplay="clock" now={NOW} />);
    const rows = screen.getAllByTestId("schedule-block");

    const doneRow = rows.find(
      (row) => row.getAttribute("data-state") === "done",
    );
    expect(doneRow!.textContent).toMatch(/^Completed:/);

    const nowRow = rows.find((row) => row.getAttribute("data-state") === "now");
    expect(nowRow!.textContent).toMatch(/^Now:/);

    const upcomingRow = rows.find(
      (row) => row.getAttribute("data-state") === "upcoming",
    );
    expect(upcomingRow!.textContent).not.toMatch(/^(Completed|Now):/);

    const freeRow = rows.find(
      (row) => row.getAttribute("data-state") === "free",
    );
    expect(freeRow!.textContent).not.toMatch(/^(Completed|Now):/);
  });
});
