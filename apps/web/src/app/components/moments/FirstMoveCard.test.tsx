import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstMoveCard, type FirstMoveCardMove } from "./FirstMoveCard";

function makeMove(
  overrides: Partial<FirstMoveCardMove> = {},
): FirstMoveCardMove {
  return {
    title: "Draft the proposal",
    why: "Oldest active commitment",
    areaLabel: "Work",
    estMinutes: 25,
    ...overrides,
  };
}

describe("FirstMoveCard", () => {
  it("renders exactly one visually-primary action", () => {
    render(
      <FirstMoveCard
        move={makeMove()}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );

    expect(screen.getByTestId("first-move-start")).toBeInTheDocument();
    // Snooze/swap must not carry the primary styling class.
    const start = screen.getByTestId("first-move-start");
    const snooze = screen.getByTestId("first-move-snooze");
    const swap = screen.getByTestId("first-move-swap");
    expect(start.className).not.toEqual(snooze.className);
    expect(start.className).not.toEqual(swap.className);
  });

  it("fires onStart, onSnooze, and onSwap", () => {
    const onStart = vi.fn();
    const onSnooze = vi.fn();
    const onSwap = vi.fn();

    render(
      <FirstMoveCard
        move={makeMove()}
        onStart={onStart}
        onSnooze={onSnooze}
        onSwap={onSwap}
      />,
    );

    fireEvent.click(screen.getByTestId("first-move-start"));
    fireEvent.click(screen.getByTestId("first-move-snooze"));
    fireEvent.click(screen.getByTestId("first-move-swap"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  // SP-3 numeric steadiness: the estimated-minutes meta line must not jiggle,
  // so it renders with tabular figures. (Impeccable follow-up: the uppercase
  // "First move" eyebrow is gone — the est/area data lives in a quiet meta
  // line under the title.)
  it("renders the estMinutes meta line with tabular-nums and no eyebrow", () => {
    const { container } = render(
      <FirstMoveCard
        move={makeMove()}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(screen.getByText(/25 min · Work/)).toHaveClass("tabular-nums");
    expect(
      container.querySelector(".workflow-page-eyebrow"),
    ).not.toBeInTheDocument();
  });

  it("renders followOn only when present", () => {
    const { rerender } = render(
      <FirstMoveCard
        move={makeMove({ followOn: undefined })}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Then:/)).not.toBeInTheDocument();

    rerender(
      <FirstMoveCard
        move={makeMove({ followOn: "Next: 1:1 with Priya" })}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(screen.getByText(/Then: Next: 1:1 with Priya/)).toBeInTheDocument();
  });

  // SP-9: the Start/Snooze/Swap actions reach a >=44px effective hit area
  // and drop the 300ms double-tap delay on coarse pointers.
  it("action buttons carry hit-area and touch-manipulation utilities", () => {
    render(
      <FirstMoveCard
        move={makeMove()}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );

    expect(screen.getByTestId("first-move-start")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("first-move-start")).toHaveClass(
      "touch-manipulation",
    );
    expect(screen.getByTestId("first-move-snooze")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("first-move-swap")).toHaveClass("min-h-[44px]");
  });
});
