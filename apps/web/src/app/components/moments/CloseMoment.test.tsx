import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloseMoment, type CloseWinVM } from "./CloseMoment";
import type { CloseVM } from "./momentsViewModel";

const baseVm: CloseVM = {
  completedToday: 2,
  missedToday: 0,
  carryForward: [],
  tomorrowFirstMove: null,
  winCandidates: [],
  rollupDrafts: [],
};

const win: CloseWinVM = {
  taskId: "t-win",
  title: "Shipped onboarding",
  areaLabel: "Main Job",
};

function renderClose(
  overrides: Partial<React.ComponentProps<typeof CloseMoment>> = {},
) {
  const props = {
    vm: baseVm,
    pendingWins: [] as CloseWinVM[],
    confirmedWins: [] as { title: string; areaLabel: string }[],
    pendingRollups: [] as React.ComponentProps<
      typeof CloseMoment
    >["pendingRollups"],
    approvedRollups: [] as React.ComponentProps<
      typeof CloseMoment
    >["approvedRollups"],
    onCloseDay: vi.fn(),
    onCarryForward: vi.fn(),
    onConfirmWin: vi.fn(),
    onSkipWin: vi.fn(),
    onApproveRollup: vi.fn(),
    onDismissRollup: vi.fn(),
    onToggleRollupProse: vi.fn(),
    pendingMonthlyRollups: [] as React.ComponentProps<
      typeof CloseMoment
    >["pendingMonthlyRollups"],
    approvedMonthlyRollups: [] as React.ComponentProps<
      typeof CloseMoment
    >["approvedMonthlyRollups"],
    onApproveMonthlyRollup: vi.fn(),
    onDismissMonthlyRollup: vi.fn(),
    onToggleMonthlyRollupProse: vi.fn(),
    ...overrides,
  };
  render(<CloseMoment {...props} />);
  return props;
}

// R2-D (issue #483 round 2) then R3-B (round 3): the stats card used to be
// a hard `grid grid-cols-2` full-bleed box holding exactly two numbers — a
// full-bleed box whose content fills only ~56% of it reads as
// sparse-by-accident. R2-D fixed the hollowness by hugging the stats row to
// its own content, but that turned into a *new* regression: on a quiet day
// the hugging stats card, the full-width Carry forward panel, and the
// standalone "Close the day" button stacked as three unrelated block
// widths with no shared card boundary. R3-B folds stats + carry forward +
// tomorrow's first move + the close action into ONE flagship card (the
// closing ritual) so there is exactly one boundary, not three. jsdom has no
// layout engine, so this asserts the classes/DOM nesting that drive that
// composition rather than measured pixels (measured with Playwright
// separately — see the round-3 visual self-check).
describe("CloseMoment — R2-D/R3-B stats + close composition", () => {
  it("does not force the stats row into a full-bleed two-column grid", () => {
    renderClose();
    const stats = screen.getByTestId("close-moment-stats");
    expect(stats.className).not.toMatch(/\bgrid-cols-2\b/);
    expect(stats.className).not.toMatch(/\bgrid\b/);
  });

  it("hugs the stats row to its own content width, never stretched", () => {
    renderClose();
    const stats = screen.getByTestId("close-moment-stats");
    expect(stats.className).toMatch(/\bw-fit\b/);
  });

  it("separates the two stats with a hairline divider, not just a gap", () => {
    renderClose();
    const stats = screen.getByTestId("close-moment-stats");
    expect(stats.className).toMatch(/\bdivide-x\b/);
  });

  it("renders both stat figures with tabular numerals", () => {
    renderClose();
    expect(screen.getByTestId("close-moment-completed")).toHaveClass(
      "tabular-nums",
    );
    expect(screen.getByTestId("close-moment-missed")).toHaveClass(
      "tabular-nums",
    );
  });

  // R3-B regression coverage: stats, carry forward, and the close action
  // must share one card boundary — never three disconnected block widths.
  it("shares one card boundary across stats, carry forward, and the close action", () => {
    renderClose();
    const summary = screen.getByTestId("close-moment-summary");
    expect(summary.contains(screen.getByTestId("close-moment-stats"))).toBe(
      true,
    );
    expect(
      summary.contains(screen.getByTestId("close-moment-carry-forward-empty")),
    ).toBe(true);
    expect(summary.contains(screen.getByTestId("close-moment-close-day"))).toBe(
      true,
    );
  });

  it("nests tomorrow's first move inside the same summary card when present", () => {
    renderClose({
      vm: {
        ...baseVm,
        tomorrowFirstMove: {
          title: "Draft the proposal",
          why: "Highest leverage",
          areaLabel: "Main Job",
          estMinutes: 25,
          taskId: "t-tomorrow",
        },
      },
    });
    const summary = screen.getByTestId("close-moment-summary");
    expect(
      summary.contains(screen.getByTestId("close-moment-tomorrow-first-move")),
    ).toBe(true);
  });

  it("always states what closing does, paired with the action (not gated on empty)", () => {
    renderClose();
    expect(screen.getByTestId("close-moment-orientation")).toHaveTextContent(
      /closing saves today's counts/i,
    );

    renderClose({
      vm: { ...baseVm, completedToday: 5, missedToday: 1 },
      pendingWins: [win],
    });
    expect(
      screen.getAllByTestId("close-moment-orientation")[1],
    ).toHaveTextContent(/closing saves today's counts/i);
  });

  it("keeps the wins card above the summary card, and preserves stats -> carry forward -> tomorrow -> action order within it on a populated day", () => {
    renderClose({
      pendingWins: [win],
      vm: {
        ...baseVm,
        carryForward: [{ taskId: "t-cf", title: "Missed review" }],
        tomorrowFirstMove: {
          title: "Draft the proposal",
          why: "Highest leverage",
          areaLabel: "Main Job",
          estMinutes: 25,
          taskId: "t-tomorrow",
        },
      },
    });

    const winsHeading = screen.getByText("Wins & evidence");
    const summary = screen.getByTestId("close-moment-summary");
    // The wins card (a sibling section above the summary card) must still
    // precede the summary card in document order — the R3-B merge folded
    // stats/carry-forward/tomorrow/action together, but must not have
    // silently reordered the summary card ahead of the review sections.
    expect(
      winsHeading.compareDocumentPosition(summary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const stats = screen.getByTestId("close-moment-stats");
    const carryList = screen.getByTestId("close-moment-carry-forward-list");
    const tomorrow = screen.getByTestId("close-moment-tomorrow-first-move");
    const closeBtn = screen.getByTestId("close-moment-close-day");

    expect(
      stats.compareDocumentPosition(carryList) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      carryList.compareDocumentPosition(tomorrow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tomorrow.compareDocumentPosition(closeBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses one eyebrow system (moments-label) for both summary sub-sections", () => {
    renderClose({
      vm: {
        ...baseVm,
        tomorrowFirstMove: {
          title: "Draft the proposal",
          why: "Highest leverage",
          areaLabel: "Main Job",
          estMinutes: 25,
          taskId: "t-tomorrow",
        },
      },
    });
    const summary = screen.getByTestId("close-moment-summary");
    const headings = summary.querySelectorAll("h3");
    expect(headings.length).toBeGreaterThan(0);
    headings.forEach((heading) => {
      expect(heading.className).toMatch(/\bmoments-label\b/);
      expect(heading.className).not.toMatch(/\bworkflow-page-eyebrow\b/);
    });
  });
});

describe("CloseMoment — S7 wins harvest", () => {
  it("hides the wins card entirely when there is nothing to harvest or show", () => {
    renderClose();
    expect(screen.queryByTestId("close-moment-wins-pending")).toBeNull();
    expect(screen.queryByTestId("close-moment-wins-confirmed")).toBeNull();
  });

  it("confirms a candidate with its (possibly edited) title", () => {
    const props = renderClose({ pendingWins: [win] });

    const input = screen.getByTestId(
      "close-moment-win-title-t-win",
    ) as HTMLInputElement;
    expect(input.value).toBe("Shipped onboarding");

    fireEvent.change(input, { target: { value: "Shipped onboarding v2" } });
    fireEvent.click(screen.getByTestId("close-moment-win-confirm-t-win"));

    expect(props.onConfirmWin).toHaveBeenCalledWith(
      "t-win",
      "Shipped onboarding v2",
    );
    expect(props.onSkipWin).not.toHaveBeenCalled();
  });

  it("skips a candidate without confirming (writes nothing)", () => {
    const props = renderClose({ pendingWins: [win] });

    fireEvent.click(screen.getByTestId("close-moment-win-skip-t-win"));

    expect(props.onSkipWin).toHaveBeenCalledWith("t-win");
    expect(props.onConfirmWin).not.toHaveBeenCalled();
  });

  it("disables confirm when the title is blank", () => {
    renderClose({ pendingWins: [win] });

    const input = screen.getByTestId("close-moment-win-title-t-win");
    fireEvent.change(input, { target: { value: "   " } });

    expect(screen.getByTestId("close-moment-win-confirm-t-win")).toBeDisabled();
  });

  it("reads back confirmed wins and shows the all-logged empty state", () => {
    renderClose({
      pendingWins: [],
      confirmedWins: [{ title: "Closed the quarter", areaLabel: "Main Job" }],
    });

    expect(screen.getByTestId("close-moment-wins-confirmed")).toHaveTextContent(
      "Closed the quarter",
    );
    expect(screen.getByTestId("close-moment-wins-empty")).toBeInTheDocument();
  });
});

const rollupDraft = {
  areaId: "area-1",
  areaLabel: "Main Job",
  periodStart: "2026-05-04",
  periodEnd: "2026-05-10",
  periodLabel: "2026-05-04 – 2026-05-10",
  summary: {
    highlights: ["Shipped onboarding"],
    misses: ["Skipped review"],
    counts: { wins: 1, completed_sessions: 4, missed_sessions: 1 },
  },
};

describe("CloseMoment — S8 rollup readback", () => {
  it("hides the rollup card when there is nothing to approve or show", () => {
    renderClose();
    expect(screen.queryByTestId("close-moment-rollup-area-1")).toBeNull();
    expect(screen.queryByTestId("close-moment-rollups-approved")).toBeNull();
  });

  it("renders a pending rollup draft with highlights and misses", () => {
    renderClose({ pendingRollups: [rollupDraft] });
    const card = screen.getByTestId("close-moment-rollup-area-1");
    expect(card).toHaveTextContent("Main Job");
    expect(card).toHaveTextContent("Shipped onboarding");
    expect(card).toHaveTextContent("Skipped review");
  });

  it("approves a rollup draft", () => {
    const props = renderClose({ pendingRollups: [rollupDraft] });
    fireEvent.click(screen.getByTestId("close-moment-rollup-approve-area-1"));
    expect(props.onApproveRollup).toHaveBeenCalledWith(rollupDraft);
    expect(props.onDismissRollup).not.toHaveBeenCalled();
  });

  it("dismisses a rollup draft without approving (writes nothing)", () => {
    const props = renderClose({ pendingRollups: [rollupDraft] });
    fireEvent.click(screen.getByTestId("close-moment-rollup-dismiss-area-1"));
    expect(props.onDismissRollup).toHaveBeenCalledWith("area-1");
    expect(props.onApproveRollup).not.toHaveBeenCalled();
  });

  it("reads back approved rollups", () => {
    renderClose({
      approvedRollups: [
        {
          areaLabel: "Main Job",
          periodLabel: "2026-05-04 – 2026-05-10",
          counts: { wins: 1 },
        },
      ],
    });
    expect(
      screen.getByTestId("close-moment-rollups-approved"),
    ).toHaveTextContent("Main Job");
  });

  it("shows no AI provenance affordance for a deterministic draft", () => {
    renderClose({ pendingRollups: [rollupDraft] });
    expect(
      screen.queryByTestId("close-moment-rollup-aiflag-area-1"),
    ).toBeNull();
    expect(
      screen.queryByTestId("close-moment-rollup-toggleprose-area-1"),
    ).toBeNull();
  });

  it("flags AI-polished prose and offers to keep the original", () => {
    const props = renderClose({
      pendingRollups: [
        { ...rollupDraft, enhanced: true, hasEnhancement: true },
      ],
    });
    expect(
      screen.getByTestId("close-moment-rollup-aiflag-area-1"),
    ).toHaveTextContent("AI-polished");

    const toggle = screen.getByTestId("close-moment-rollup-toggleprose-area-1");
    expect(toggle).toHaveTextContent("Keep original");
    fireEvent.click(toggle);
    expect(props.onToggleRollupProse).toHaveBeenCalledWith("area-1");
  });

  it("hides the flag and offers the AI version once the original is kept", () => {
    renderClose({
      pendingRollups: [
        { ...rollupDraft, enhanced: false, hasEnhancement: true },
      ],
    });
    expect(
      screen.queryByTestId("close-moment-rollup-aiflag-area-1"),
    ).toBeNull();
    expect(
      screen.getByTestId("close-moment-rollup-toggleprose-area-1"),
    ).toHaveTextContent("Use AI version");
  });
});

const monthlyRollupDraft = {
  areaId: "area-1",
  areaLabel: "Main Job",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-05",
  periodLabel: "2026-07-01 – 2026-07-05",
  summary: {
    highlights: ["Shipped onboarding", "Launched pricing"],
    misses: ["Deep-work morning"],
    counts: { wins: 2, completed_sessions: 10, missed_sessions: 1 },
  },
  weeksComposed: 2,
};

describe("CloseMoment — #486 monthly rollup readback", () => {
  it("hides the monthly rollup card when there is nothing to approve or show", () => {
    renderClose();
    expect(
      screen.queryByTestId("close-moment-monthly-rollup-area-1"),
    ).toBeNull();
    expect(
      screen.queryByTestId("close-moment-monthly-rollups-approved"),
    ).toBeNull();
  });

  it("renders a pending monthly rollup draft with highlights and misses", () => {
    renderClose({ pendingMonthlyRollups: [monthlyRollupDraft] });
    const card = screen.getByTestId("close-moment-monthly-rollup-area-1");
    expect(card).toHaveTextContent("Main Job");
    expect(card).toHaveTextContent("Shipped onboarding");
    expect(card).toHaveTextContent("Launched pricing");
    expect(card).toHaveTextContent("Deep-work morning");
  });

  it("approves a monthly rollup draft", () => {
    const props = renderClose({
      pendingMonthlyRollups: [monthlyRollupDraft],
    });
    fireEvent.click(
      screen.getByTestId("close-moment-monthly-rollup-approve-area-1"),
    );
    expect(props.onApproveMonthlyRollup).toHaveBeenCalledWith(
      monthlyRollupDraft,
    );
    expect(props.onDismissMonthlyRollup).not.toHaveBeenCalled();
  });

  it("dismisses a monthly rollup draft without approving (writes nothing)", () => {
    const props = renderClose({
      pendingMonthlyRollups: [monthlyRollupDraft],
    });
    fireEvent.click(
      screen.getByTestId("close-moment-monthly-rollup-dismiss-area-1"),
    );
    expect(props.onDismissMonthlyRollup).toHaveBeenCalledWith("area-1");
    expect(props.onApproveMonthlyRollup).not.toHaveBeenCalled();
  });

  it("reads back approved monthly rollups", () => {
    renderClose({
      approvedMonthlyRollups: [
        {
          areaLabel: "Main Job",
          periodLabel: "2026-07-01 – 2026-07-05",
          counts: { wins: 2 },
        },
      ],
    });
    expect(
      screen.getByTestId("close-moment-monthly-rollups-approved"),
    ).toHaveTextContent("Main Job");
  });

  it("shows no AI provenance affordance for a deterministic draft", () => {
    renderClose({ pendingMonthlyRollups: [monthlyRollupDraft] });
    expect(
      screen.queryByTestId("close-moment-monthly-rollup-aiflag-area-1"),
    ).toBeNull();
    expect(
      screen.queryByTestId("close-moment-monthly-rollup-toggleprose-area-1"),
    ).toBeNull();
  });

  it("flags AI-polished prose and offers to keep the original", () => {
    const props = renderClose({
      pendingMonthlyRollups: [
        { ...monthlyRollupDraft, enhanced: true, hasEnhancement: true },
      ],
    });
    expect(
      screen.getByTestId("close-moment-monthly-rollup-aiflag-area-1"),
    ).toHaveTextContent("AI-polished");

    const toggle = screen.getByTestId(
      "close-moment-monthly-rollup-toggleprose-area-1",
    );
    expect(toggle).toHaveTextContent("Keep original");
    fireEvent.click(toggle);
    expect(props.onToggleMonthlyRollupProse).toHaveBeenCalledWith("area-1");
  });

  it("renders the month-over-month readback only when a prior-month row exists", () => {
    renderClose({
      pendingMonthlyRollups: [monthlyRollupDraft],
      monthOverMonthReadback: [
        {
          areaId: "area-1",
          periodLabel: "2026-06-01 – 2026-06-30",
          counts: { wins: 1, completed_sessions: 4, missed_sessions: 1 },
        },
      ],
    });
    expect(
      screen.getByTestId("close-moment-monthly-rollup-mom-area-1"),
    ).toHaveTextContent("vs last month");
  });

  it("never fabricates a month-over-month line when no prior row is supplied", () => {
    renderClose({ pendingMonthlyRollups: [monthlyRollupDraft] });
    expect(
      screen.queryByTestId("close-moment-monthly-rollup-mom-area-1"),
    ).toBeNull();
  });
});

// FR-047 slice 2 / FR-033 (#686): the optional Close purpose-gauge check-in.
// Offer visibility is parent-gated (purposeGaugeOffered); a frictionless
// decline is simply never tapping, which must record nothing.
describe("CloseMoment — purpose-gauge check-in offer", () => {
  it("shows the one-tap offer only when the parent gate says it is offered", () => {
    renderClose({ purposeGaugeOffered: true, onPurposeGaugeCheckIn: vi.fn() });
    expect(
      screen.getByTestId("close-moment-purpose-gauge"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("close-moment-purpose-gauge-lighter"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("close-moment-purpose-gauge-even"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("close-moment-purpose-gauge-heavier"),
    ).toBeInTheDocument();
  });

  it("hides the offer when the parent gate is closed (non-sample day / already answered)", () => {
    renderClose({ purposeGaugeOffered: false, onPurposeGaugeCheckIn: vi.fn() });
    expect(screen.queryByTestId("close-moment-purpose-gauge")).toBeNull();
  });

  it("hides the offer when no handler is wired even if flagged offered", () => {
    renderClose({ purposeGaugeOffered: true });
    expect(screen.queryByTestId("close-moment-purpose-gauge")).toBeNull();
  });

  it("records the tapped response exactly once and dismisses the offer in-view", () => {
    const onPurposeGaugeCheckIn = vi.fn();
    renderClose({ purposeGaugeOffered: true, onPurposeGaugeCheckIn });

    fireEvent.click(screen.getByTestId("close-moment-purpose-gauge-heavier"));

    expect(onPurposeGaugeCheckIn).toHaveBeenCalledTimes(1);
    expect(onPurposeGaugeCheckIn).toHaveBeenCalledWith("heavier");
    // Tapping dismisses the card for the rest of the view.
    expect(screen.queryByTestId("close-moment-purpose-gauge")).toBeNull();
  });

  it("records nothing when the offer is shown but never tapped (frictionless decline)", () => {
    const onPurposeGaugeCheckIn = vi.fn();
    renderClose({ purposeGaugeOffered: true, onPurposeGaugeCheckIn });

    // Close the day without ever touching the gauge.
    fireEvent.click(screen.getByTestId("close-moment-close-day"));

    expect(onPurposeGaugeCheckIn).not.toHaveBeenCalled();
    // The offer is still present (untapped), proving no implicit recording.
    expect(
      screen.getByTestId("close-moment-purpose-gauge"),
    ).toBeInTheDocument();
  });
});
