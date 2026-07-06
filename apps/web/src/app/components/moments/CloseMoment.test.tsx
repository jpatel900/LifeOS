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

function renderClose(overrides: Partial<React.ComponentProps<typeof CloseMoment>> = {}) {
  const props = {
    vm: baseVm,
    pendingWins: [] as CloseWinVM[],
    confirmedWins: [] as { title: string; areaLabel: string }[],
    onCloseDay: vi.fn(),
    onCarryForward: vi.fn(),
    onConfirmWin: vi.fn(),
    onSkipWin: vi.fn(),
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
