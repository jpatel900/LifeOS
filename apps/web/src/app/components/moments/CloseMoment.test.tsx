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
    ...overrides,
  };
  render(<CloseMoment {...props} />);
  return props;
}

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
