import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriftRecoveryCard } from "./DriftRecoveryCard";

const BANNED_WORDS = [
  /guardrail/i,
  /\bfailed\b/i,
  /\bfailure\b/i,
  /\bwasted\b/i,
];

describe("DriftRecoveryCard", () => {
  it("shows the plain-language duration headline when minutes > 0", () => {
    render(<DriftRecoveryCard drift={{ minutes: 12 }} onReclaim={() => {}} />);
    expect(screen.getByTestId("drift-recovery-card")).toHaveTextContent(
      "You drifted for ~12 minutes.",
    );
  });

  it("shows the truthful generic headline when minutes === 0 (v0 placeholder) — never invents a duration", () => {
    render(<DriftRecoveryCard drift={{ minutes: 0 }} onReclaim={() => {}} />);
    const card = screen.getByTestId("drift-recovery-card");
    expect(card).toHaveTextContent("This block got away from you.");
    expect(card).not.toHaveTextContent("~0 minutes");
  });

  it.each([
    ["stuck", "You marked it stuck."],
    ["distracted", "You marked it distracted."],
    ["missed", "The block passed by."],
  ])("maps reason %s to its plain-language line", (reason, expected) => {
    render(
      <DriftRecoveryCard drift={{ minutes: 0, reason }} onReclaim={() => {}} />,
    );
    expect(screen.getByTestId("drift-recovery-card")).toHaveTextContent(
      expected,
    );
  });

  it("omits the reason line when reason is absent or unmapped", () => {
    render(
      <DriftRecoveryCard
        drift={{ minutes: 0, reason: "unknown-thing" }}
        onReclaim={() => {}}
      />,
    );
    const card = screen.getByTestId("drift-recovery-card");
    expect(card).not.toHaveTextContent("unknown-thing");
  });

  it("fires onReclaim when Reclaim block is clicked", () => {
    const onReclaim = vi.fn();
    render(<DriftRecoveryCard drift={{ minutes: 5 }} onReclaim={onReclaim} />);
    fireEvent.click(screen.getByTestId("drift-recovery-reclaim"));
    expect(onReclaim).toHaveBeenCalledTimes(1);
  });

  it("hides Fresh start when onAbandon is not provided (never a dead end elsewhere: Reclaim remains)", () => {
    render(<DriftRecoveryCard drift={{ minutes: 5 }} onReclaim={() => {}} />);
    expect(
      screen.queryByTestId("drift-recovery-abandon"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("drift-recovery-reclaim")).toBeInTheDocument();
  });

  it("shows and fires onAbandon when provided", () => {
    const onAbandon = vi.fn();
    render(
      <DriftRecoveryCard
        drift={{ minutes: 5 }}
        onReclaim={() => {}}
        onAbandon={onAbandon}
      />,
    );
    fireEvent.click(screen.getByTestId("drift-recovery-abandon"));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  // SP-3 numeric steadiness: the drift-minutes headline must not jiggle, so
  // it renders with tabular figures.
  it("renders the drift-minutes headline with tabular-nums", () => {
    render(<DriftRecoveryCard drift={{ minutes: 12 }} onReclaim={() => {}} />);
    expect(screen.getByText("You drifted for ~12 minutes.")).toHaveClass(
      "tabular-nums",
    );
  });

  it("contains no banned words and no destructive class", () => {
    render(
      <DriftRecoveryCard
        drift={{ minutes: 0, reason: "missed" }}
        onReclaim={() => {}}
        onAbandon={() => {}}
      />,
    );
    const card = screen.getByTestId("drift-recovery-card");
    for (const pattern of BANNED_WORDS) {
      expect(card.innerHTML).not.toMatch(pattern);
    }
    expect(card.innerHTML).not.toMatch(/destructive/i);
  });

  // SP-9: the Reclaim/Fresh-start actions reach a >=44px effective hit
  // area and drop the 300ms double-tap delay on coarse pointers.
  it("action buttons carry hit-area and touch-manipulation utilities", () => {
    render(
      <DriftRecoveryCard
        drift={{ minutes: 5 }}
        onReclaim={() => {}}
        onAbandon={() => {}}
      />,
    );
    expect(screen.getByTestId("drift-recovery-reclaim")).toHaveClass(
      "min-h-[44px]",
    );
    expect(screen.getByTestId("drift-recovery-reclaim")).toHaveClass(
      "touch-manipulation",
    );
    expect(screen.getByTestId("drift-recovery-abandon")).toHaveClass(
      "min-h-[44px]",
    );
  });
});
