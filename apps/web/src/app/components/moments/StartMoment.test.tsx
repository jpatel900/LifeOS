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
    ...overrides,
  };
}

const NOOP_HANDLERS = {
  onStartMove: vi.fn(),
  onSnooze: vi.fn(),
  onSwap: vi.fn(),
  onOpenHealth: vi.fn(),
  onDrillPipeline: vi.fn(),
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
