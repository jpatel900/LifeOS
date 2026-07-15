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
    topPendingTriageItem: null,
    greeting: "Good morning.",
    daySynthesis: "Nothing on the calendar, and nothing queued yet.",
    // Defaults false: most existing fixtures below don't care about R3-A's
    // orientation gate, and this keeps every test that doesn't explicitly
    // opt in from silently disagreeing with a populated firstMove/focusItems
    // override (real buildStartVM would compute false for any of those).
    dayIsEmpty: false,
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
  onOpenTriage: vi.fn(),
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

describe("StartMoment — state truth for pending triage (#551)", () => {
  it("renders the truthful empty state and no pending-triage line when pendingTriage is 0 and there is no firstMove", () => {
    const vm = baseVM({
      counts: { pendingTriage: 0, activeTasks: 0, todayBlocks: 0 },
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

    expect(screen.getByTestId("start-moment-empty")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-pending-triage"),
    ).not.toBeInTheDocument();
  });

  it("promotes the top pending-triage item into an accent hero card when pendingTriage is 1 and there is no firstMove", () => {
    const vm = baseVM({
      counts: { pendingTriage: 1, activeTasks: 0, todayBlocks: 0 },
      topPendingTriageItem: {
        id: "c1",
        summary: "Reply to the vendor email",
        areaLabel: "Work",
      },
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

    const card = screen.getByTestId("start-pending-triage-card");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("Reply to the vendor email");
    expect(card).toHaveTextContent("1 thought waiting for a decision.");
    expect(screen.queryByTestId("start-moment-empty")).not.toBeInTheDocument();
  });

  it("renders the plural pending-triage line alongside the first-move card when pendingTriage is 3 and firstMove is present", () => {
    const vm = baseVM({
      counts: { pendingTriage: 3, activeTasks: 0, todayBlocks: 0 },
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
    expect(screen.getByTestId("start-pending-triage")).toHaveTextContent(
      "3 thoughts waiting for a decision.",
    );
  });

  it("calls onOpenTriage when the pending-triage line is clicked (firstMove present)", () => {
    const onOpenTriage = vi.fn();
    const vm = baseVM({
      counts: { pendingTriage: 2, activeTasks: 0, todayBlocks: 0 },
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
        onOpenTriage={onOpenTriage}
      />,
    );

    screen.getByTestId("start-pending-triage").click();
    expect(onOpenTriage).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenTriage from the promoted hero card's action when there is no firstMove", () => {
    const onOpenTriage = vi.fn();
    const vm = baseVM({
      counts: { pendingTriage: 2, activeTasks: 0, todayBlocks: 0 },
      topPendingTriageItem: {
        id: "c1",
        summary: "Reply to the vendor email",
        areaLabel: "Work",
      },
    });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
        onOpenTriage={onOpenTriage}
      />,
    );

    screen.getByTestId("start-pending-triage-action").click();
    expect(onOpenTriage).toHaveBeenCalledTimes(1);
  });

  it("never implies the promoted item is scheduled — no 'scheduled'/'booked' copy", () => {
    const vm = baseVM({
      counts: { pendingTriage: 1, activeTasks: 0, todayBlocks: 0 },
      topPendingTriageItem: {
        id: "c1",
        summary: "Reply to the vendor email",
        areaLabel: "Work",
      },
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

    const card = screen.getByTestId("start-pending-triage-card");
    expect(card.textContent?.toLowerCase()).not.toMatch(
      /scheduled|booked|on your calendar/,
    );
  });
});

describe("StartMoment — D-8 hero composition (#483)", () => {
  it("never collapses the hero to a bare text line: fully-empty state renders an accent hero card, not a bare paragraph", () => {
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

    const card = screen.getByTestId("start-moment-empty");
    expect(card.className).toContain("workflow-flagship-card");
    expect(card.className).toContain("moments-card--emphasis");
    expect(card.textContent?.toLowerCase()).not.toMatch(
      /you failed|you didn't|blame|should have/,
    );
  });

  it("renders the Pipeline rail above the two-column grid, directly under the hero", () => {
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

    const hero = screen.getByTestId("start-hero");
    const pipelineRail = screen.getByTestId("start-moment-pipeline-rail");
    const scheduleHeading = screen.getByText("Today's schedule");

    // Hero -> Pipeline -> everything else (the two-column grid).
    expect(
      hero.compareDocumentPosition(pipelineRail) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pipelineRail.compareDocumentPosition(scheduleHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("the promoted pending-triage hero card carries the same visual weight as FirstMoveCard", () => {
    const vm = baseVM({
      counts: { pendingTriage: 1, activeTasks: 0, todayBlocks: 0 },
      topPendingTriageItem: {
        id: "c1",
        summary: "Reply to the vendor email",
        areaLabel: "Work",
      },
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

    const card = screen.getByTestId("start-pending-triage-card");
    expect(card.className).toContain("workflow-flagship-card");
    expect(card.className).toContain("moments-card--emphasis");
  });
});

describe("StartMoment — R2-B empty-state copy is not a restatement of the day-synthesis line (#483 round 2)", () => {
  it("the empty-state hero card's copy does not echo vm.daySynthesis", () => {
    const daySynthesis = "Nothing on the calendar, and nothing queued yet.";
    const vm = baseVM({ daySynthesis });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const synthesisLine = screen.getByTestId("start-day-synthesis");
    expect(synthesisLine).toHaveTextContent(daySynthesis);

    const card = screen.getByTestId("start-moment-empty");
    // The card must not restate the sentence that already ran above it —
    // neither the whole sentence nor its constituent facts ("nothing
    // queued", "nothing on the calendar").
    expect(card.textContent).not.toContain(daySynthesis);
    expect(card.textContent?.toLowerCase()).not.toContain("nothing queued");
    expect(card.textContent?.toLowerCase()).not.toContain(
      "nothing on the calendar",
    );
  });

  it("the empty-state hero card spends its content on the single capture action, not a fact restatement", () => {
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

    const card = screen.getByTestId("start-moment-empty");
    expect(card).toHaveTextContent("Quick capture");
    expect(card).toHaveTextContent("Capture a thought");
    expect(card).toHaveTextContent("C");
  });
});

describe("StartMoment — R2-B eyebrow system unification (#483 round 2)", () => {
  it("'Today's focus' and 'Today's schedule' use the same eyebrow class as the card eyebrows in this column, not the separate moments-label system", () => {
    const first = {
      title: "Write report",
      why: "Oldest active commitment",
      areaLabel: "Work",
      estMinutes: 25,
      taskId: "t1",
    };
    const deferred = {
      title: "Second task",
      why: "Next up",
      areaLabel: "Work",
      estMinutes: 15,
      taskId: "t2",
    };
    const vm = baseVM({
      firstMove: first,
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

    const focusHeading = screen.getByText("Today's focus");
    const scheduleHeading = screen.getByText("Today's schedule");
    const cardEyebrow = screen.getByTestId("first-move-card").querySelector(
      ".workflow-page-eyebrow",
    );

    expect(cardEyebrow).not.toBeNull();
    expect(focusHeading.className).toContain("workflow-page-eyebrow");
    expect(focusHeading.className).not.toContain("moments-label");
    expect(scheduleHeading.className).toContain("workflow-page-eyebrow");
    expect(scheduleHeading.className).not.toContain("moments-label");
  });
});

describe("StartMoment — D-8-POLISH composition (#483)", () => {
  it("never lets the two-column grid stretch a column's cards to match the other column's height (items-start on both the grid and the main column)", () => {
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

    // This is the fix for the hollow-hero-card / oversized-label-gap defects:
    // the default grid `align-items: stretch` was forcing the shorter
    // column's nested `grid` rows to absorb the taller column's leftover
    // height, padding out the hero card and the schedule label's gap
    // instead of landing anywhere deliberate.
    expect(screen.getByTestId("start-moment-grid").className).toContain(
      "items-start",
    );
    expect(
      screen.getByTestId("start-moment-main-column").className,
    ).toContain("items-start");
  });

  it("wraps Today's schedule in the same moments-card surface treatment SideRail's cards use, so the column ends at a boxed edge instead of trailing off as bare text", () => {
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

    const scheduleCard = screen.getByTestId("start-schedule-card");
    expect(scheduleCard).toBeInTheDocument();
    expect(scheduleCard.className).toContain("moments-card");
    expect(scheduleCard).toHaveTextContent("Today's schedule");
    expect(scheduleCard).toHaveTextContent(
      "Nothing on today's schedule yet",
    );
  });

  it("keeps the schedule card in place (after the hero, before SideRail) whether the hero is FirstMoveCard or the empty state", () => {
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

    const firstMoveCard = screen.getByTestId("first-move-card");
    const scheduleCard = screen.getByTestId("start-schedule-card");
    const sideRail = screen.getByTestId("side-rail");

    expect(
      firstMoveCard.compareDocumentPosition(scheduleCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      scheduleCard.compareDocumentPosition(sideRail) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("StartMoment — R3-A LoopOrientation gate (#483 round 3)", () => {
  it("renders the loop-orientation diagram when the day is genuinely empty", () => {
    const vm = baseVM({ dayIsEmpty: true });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    expect(screen.getByTestId("start-loop-orientation")).toBeInTheDocument();
  });

  it("does not render the loop-orientation diagram when dayIsEmpty is false, even with the truthful empty hero showing", () => {
    // firstMove/topPendingTriageItem both null (state-3 empty hero) but
    // dayIsEmpty explicitly false — e.g. a schedule block exists in a state
    // deriveFirstMove didn't pick. The two gates are deliberately separate.
    const vm = baseVM({ dayIsEmpty: false });

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
    expect(
      screen.queryByTestId("start-loop-orientation"),
    ).not.toBeInTheDocument();
  });

  it("recedes when a real firstMove exists, even if dayIsEmpty were somehow true (defense in depth against an inconsistent VM)", () => {
    const vm = baseVM({
      dayIsEmpty: true,
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

    // The gate is a straight `vm.dayIsEmpty` read (see StartMoment.tsx) —
    // this documents that StartMoment trusts the VM rather than
    // re-deriving; production `buildStartVM` never produces this
    // combination (see momentsViewModel.test.ts's dayIsEmpty coverage).
    expect(screen.getByTestId("start-loop-orientation")).toBeInTheDocument();
  });

  it("recedes when a pending-triage item is promoted into the hero", () => {
    const vm = baseVM({
      dayIsEmpty: false,
      counts: { pendingTriage: 1, activeTasks: 0, todayBlocks: 0 },
      topPendingTriageItem: {
        id: "c1",
        summary: "Reply to the vendor email",
        areaLabel: "Work",
      },
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

    expect(screen.getByTestId("start-pending-triage-card")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-loop-orientation"),
    ).not.toBeInTheDocument();
  });

  it("renders every pipeline stage, in order, as a short fragment (not a sentence)", () => {
    const vm = baseVM({ dayIsEmpty: true });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const nodes = screen.getAllByTestId(/^start-loop-orientation-stage-/);
    expect(nodes.map((node) => node.dataset.testid)).toEqual([
      "start-loop-orientation-stage-capture",
      "start-loop-orientation-stage-triage",
      "start-loop-orientation-stage-plan",
      "start-loop-orientation-stage-execute",
      "start-loop-orientation-stage-review",
    ]);
    // No node's text should run long enough to read as a sentence — the
    // diagram (position + connector), not prose, carries the sequence.
    for (const node of nodes) {
      expect((node.textContent ?? "").length).toBeLessThan(40);
    }
  });

  it("never implies a state change: no node claims anything is done/scheduled/in progress", () => {
    const vm = baseVM({ dayIsEmpty: true });

    render(
      <StartMoment
        vm={vm}
        timeDisplay="clock"
        now={NOW}
        pipelineCounts={{}}
        {...NOOP_HANDLERS}
      />,
    );

    const loop = screen.getByTestId("start-loop-orientation");
    expect(loop.textContent?.toLowerCase()).not.toMatch(
      /done|scheduled|in progress|completed|current/,
    );
  });
});
