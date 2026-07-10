import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StartMoment } from "./StartMoment";
import type { StartVM } from "./momentsViewModel";

const NOW = new Date("2026-07-05T15:00:00.000Z");

function baseVM(overrides: Partial<StartVM> = {}): StartVM {
  return {
    firstMove: null,
    blocks: [],
    waitingOn: [],
    areas: [],
    counts: { pendingTriage: 0, activeTasks: 0, todayBlocks: 0 },
    focusBudget: 3,
    focusDegraded: false,
    focusItems: [],
    deferredItems: [],
    staleProject: null,
    recoveryNudge: null,
    greeting: "Good morning.",
    daySynthesis:
      "Nothing on the calendar and nothing queued — capture something to get moving.",
    ...overrides,
  };
}

const NOOP_HANDLERS = {
  onStartMove: vi.fn(),
  onSnooze: vi.fn(),
  onSwap: vi.fn(),
  onOpenHealth: vi.fn(),
  onDrillPipeline: vi.fn(),
  onOpenRecovery: vi.fn(),
};

describe("StartMoment — S5 focus budget (#257)", () => {
  it("renders FirstMoveCard for the #1 focus item, unchanged from before S5", () => {
    const vm = baseVM({
      firstMove: {
        title: "Write report",
        why: "Oldest active commitment",
        areaLabel: "Work",
        estMinutes: 25,
        taskId: "t1",
      },
      focusItems: [
        {
          title: "Write report",
          why: "Oldest active commitment",
          areaLabel: "Work",
          estMinutes: 25,
          taskId: "t1",
        },
      ],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("first-move-card")).toBeInTheDocument();
    expect(screen.getByText("Write report")).toBeInTheDocument();
  });

  it("does not render a 'Today's focus' section when there is only firstMove and nothing deferred", () => {
    const vm = baseVM({
      firstMove: {
        title: "Only task",
        why: "Oldest active commitment",
        areaLabel: "Work",
        estMinutes: 25,
        taskId: "t1",
      },
      focusItems: [
        {
          title: "Only task",
          why: "Oldest active commitment",
          areaLabel: "Work",
          estMinutes: 25,
          taskId: "t1",
        },
      ],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.queryByText("Today's focus")).not.toBeInTheDocument();
    expect(screen.queryByTestId("focus-list")).not.toBeInTheDocument();
  });

  it("renders remaining in-budget focus items (items 2..N) below FirstMoveCard", () => {
    const first = {
      title: "First item",
      why: "Scheduled now",
      areaLabel: "Work",
      estMinutes: 30,
      taskId: "t1",
    };
    const second = {
      title: "Second item",
      why: "Oldest active commitment",
      areaLabel: "Home",
      estMinutes: 25,
      taskId: "t2",
    };

    const vm = baseVM({
      firstMove: first,
      focusBudget: 2,
      focusItems: [first, second],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByText("Today's focus")).toBeInTheDocument();
    expect(screen.getByText("Second item")).toBeInTheDocument();
    // First item is only rendered once, via FirstMoveCard, not duplicated
    // in the FocusList body.
    expect(screen.getAllByText("First item")).toHaveLength(1);
  });

  it("renders deferred items visibly, marked Deferred, not hidden", () => {
    const first = {
      title: "First item",
      why: "Scheduled now",
      areaLabel: "Work",
      estMinutes: 30,
      taskId: "t1",
    };
    const deferred = {
      title: "Deferred item",
      why: "Oldest active commitment",
      areaLabel: "Work",
      estMinutes: 25,
      taskId: "t3",
    };

    const vm = baseVM({
      firstMove: first,
      focusBudget: 1,
      focusItems: [first],
      deferredItems: [deferred],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByText("Deferred item")).toBeInTheDocument();
    expect(screen.getByTestId("focus-list-deferred-pill")).toHaveTextContent(
      "Deferred",
    );
  });

  it("shows the focus budget count", () => {
    const first = {
      title: "First item",
      why: "Scheduled now",
      areaLabel: "Work",
      estMinutes: 30,
      taskId: "t1",
    };
    const deferred = {
      title: "Deferred item",
      why: "Oldest active commitment",
      areaLabel: "Work",
      estMinutes: 25,
      taskId: "t3",
    };
    const vm = baseVM({
      firstMove: first,
      focusBudget: 1,
      focusItems: [first],
      deferredItems: [deferred],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("focus-budget-label")).toHaveTextContent("1");
  });

  it("shows a quiet degraded note (no guilt language) when focusDegraded is true", () => {
    const first = {
      title: "First item",
      why: "Scheduled now",
      areaLabel: "Work",
      estMinutes: 30,
      taskId: "t1",
    };
    const deferred = {
      title: "Deferred item",
      why: "Oldest active commitment",
      areaLabel: "Work",
      estMinutes: 25,
      taskId: "t3",
    };
    const vm = baseVM({
      firstMove: first,
      focusBudget: 2,
      focusDegraded: true,
      focusItems: [first],
      deferredItems: [deferred],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const note = screen.getByTestId("focus-degraded-note");
    expect(note).toHaveTextContent("default focus budget is in use");
    expect(note.textContent?.toLowerCase()).not.toMatch(
      /you failed|you didn't|blame|should have/,
    );
  });

  it("does not show the degraded note when focusDegraded is false", () => {
    const first = {
      title: "First item",
      why: "Scheduled now",
      areaLabel: "Work",
      estMinutes: 30,
      taskId: "t1",
    };
    const deferred = {
      title: "Deferred item",
      why: "Oldest active commitment",
      areaLabel: "Work",
      estMinutes: 25,
      taskId: "t3",
    };
    const vm = baseVM({
      firstMove: first,
      focusBudget: 1,
      focusDegraded: false,
      focusItems: [first],
      deferredItems: [deferred],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.queryByTestId("focus-degraded-note")).not.toBeInTheDocument();
  });

  it("still renders the existing truthful empty state when there is no firstMove", () => {
    const vm = baseVM();

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("start-moment-empty")).toBeInTheDocument();
  });
});

describe("StartMoment — S6 daily brief (#258)", () => {
  it("omits the stale-project line entirely when staleProject is null", () => {
    const vm = baseVM({ staleProject: null });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.queryByTestId("start-stale-project")).not.toBeInTheDocument();
  });

  it("renders a calm 'hasn't moved in N days' line when staleProject is present", () => {
    const vm = baseVM({
      staleProject: { id: "p1", name: "Q2 planning doc", ageDays: 12 },
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const line = screen.getByTestId("start-stale-project");
    expect(line).toBeInTheDocument();
    expect(line.textContent).toContain("Hasn't moved in 12 days");
    expect(line.textContent).toContain("Q2 planning doc");
  });

  it("omits the recovery-nudge card entirely when recoveryNudge is null", () => {
    const vm = baseVM({ recoveryNudge: null });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(
      screen.queryByTestId("start-recovery-nudge"),
    ).not.toBeInTheDocument();
  });

  it("renders the recovery-nudge card with --state-watch (never --state-risk) and a single forward action", () => {
    const vm = baseVM({
      recoveryNudge: { blockTitle: "Draft the proposal", taskId: "t1" },
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const card = screen.getByTestId("start-recovery-nudge");
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain("Draft the proposal");
    expect(card.getAttribute("style") ?? "").toContain("--state-watch");
    expect(card.innerHTML).not.toContain("--state-risk");

    expect(screen.getByTestId("start-recovery-nudge-open")).toBeInTheDocument();
  });

  it("recovery-nudge action calls onOpenRecovery with the task id and does not mutate any local state itself", () => {
    const onOpenRecovery = vi.fn();
    const vm = baseVM({
      recoveryNudge: { blockTitle: "Draft the proposal", taskId: "t1" },
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
        onOpenRecovery={onOpenRecovery}
      />,
    );

    screen.getByTestId("start-recovery-nudge-open").click();
    expect(onOpenRecovery).toHaveBeenCalledTimes(1);
    expect(onOpenRecovery).toHaveBeenCalledWith("t1");
  });

  it("renders both sections together without interfering with the schedule/focus sections", () => {
    const vm = baseVM({
      staleProject: { id: "p1", name: "Side project", ageDays: 20 },
      recoveryNudge: { blockTitle: "Review notes", taskId: "t2" },
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("start-stale-project")).toBeInTheDocument();
    expect(screen.getByTestId("start-recovery-nudge")).toBeInTheDocument();
    expect(screen.getByTestId("start-moment-empty")).toBeInTheDocument();
  });
});

describe("StartMoment — D-2 start-moment hero (#483)", () => {
  it("renders the injected greeting verbatim", () => {
    const vm = baseVM({ greeting: "Good afternoon, Jay." });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("start-greeting")).toHaveTextContent(
      "Good afternoon, Jay.",
    );
  });

  it("renders the injected day-synthesis sentence verbatim", () => {
    const vm = baseVM({
      daySynthesis:
        "3 blocks on the calendar today — 2 of 3 focus slots filled.",
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("start-day-synthesis")).toHaveTextContent(
      "3 blocks on the calendar today — 2 of 3 focus slots filled.",
    );
  });

  it("renders the hero ahead of the first-move card", () => {
    const vm = baseVM({
      firstMove: {
        title: "Write report",
        why: "Oldest active commitment",
        areaLabel: "Work",
        estMinutes: 25,
        taskId: "t1",
      },
      focusItems: [
        {
          title: "Write report",
          why: "Oldest active commitment",
          areaLabel: "Work",
          estMinutes: 25,
          taskId: "t1",
        },
      ],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const hero = screen.getByTestId("start-hero");
    const firstMoveCard = screen.getByTestId("first-move-card");
    expect(
      hero.compareDocumentPosition(firstMoveCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("still renders the target 'Start now / Snooze 10m / Not this' first-move microcopy unchanged", () => {
    const vm = baseVM({
      firstMove: {
        title: "Write report",
        why: "Oldest active commitment",
        areaLabel: "Work",
        estMinutes: 25,
        taskId: "t1",
      },
      focusItems: [
        {
          title: "Write report",
          why: "Oldest active commitment",
          areaLabel: "Work",
          estMinutes: 25,
          taskId: "t1",
        },
      ],
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("first-move-start")).toHaveTextContent(
      "Start now",
    );
    expect(screen.getByTestId("first-move-snooze")).toHaveTextContent(
      "Snooze 10m",
    );
    expect(screen.getByTestId("first-move-swap")).toHaveTextContent("Not this");
  });
});
