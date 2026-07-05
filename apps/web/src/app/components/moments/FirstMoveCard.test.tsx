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

  // SP-3 numeric steadiness: the estimated-minutes eyebrow must not jiggle,
  // so it renders with tabular figures.
  it("renders the estMinutes eyebrow with tabular-nums", () => {
    render(
      <FirstMoveCard
        move={makeMove()}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(screen.getByText(/First move · 25 min · Work/)).toHaveClass(
      "tabular-nums",
    );
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
});
