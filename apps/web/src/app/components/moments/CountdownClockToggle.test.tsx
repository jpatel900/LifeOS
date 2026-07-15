import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CountdownClockToggle } from "./CountdownClockToggle";

describe("CountdownClockToggle", () => {
  it("sets aria-pressed on the active segment only", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    expect(
      screen.getByTestId("countdown-clock-toggle-countdown"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("countdown-clock-toggle-clock")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("fires onChange with the clicked segment's value", () => {
    const onChange = vi.fn();
    render(<CountdownClockToggle value="countdown" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("countdown-clock-toggle-clock"));
    expect(onChange).toHaveBeenCalledWith("clock");
  });

  // SP-4: quick color transitions use the fast motion token and fall back
  // to no motion for prefers-reduced-motion users.
  it("segments use the fast motion token with a reduced-motion fallback", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    const segment = screen.getByTestId("countdown-clock-toggle-clock");
    expect(segment).toHaveClass("duration-[var(--motion-fast)]");
    expect(segment).toHaveClass("ease-[var(--motion-ease)]");
    expect(segment).toHaveClass("motion-reduce:transition-none");
    expect(segment).toHaveClass("motion-reduce:duration-0");
  });

  // SP-9: segments reach a >=44px effective hit area and drop the 300ms
  // double-tap delay on coarse pointers.
  it("segments carry hit-area and touch-manipulation utilities", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    const segment = screen.getByTestId("countdown-clock-toggle-clock");
    expect(segment).toHaveClass("min-h-[44px]");
    expect(segment).toHaveClass("touch-manipulation");
  });

  // D-10 R2 (#483 round 2, blocker #5 — accent discipline, "the single
  // clearest 'would not ship in Linear' call on the page"): this control
  // used to paint its selected segment with `bg-primary`/
  // `text-primary-foreground` — the identical full-saturation accent fill
  // MomentSwitcher's Start/Flow/Close tabs use, ~500px away in the same
  // masthead row. A minor display-format preference carrying the same
  // visual weight as the primary moment nav means the accent stops ranking
  // anything. Regression: the selected segment must never carry the
  // primary-fill classes again, and must use the neutral raised-chip
  // treatment instead.
  it("the selected segment never carries the primary accent fill (round-1 regression)", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    const selected = screen.getByTestId("countdown-clock-toggle-countdown");
    expect(selected.className).not.toMatch(/\bbg-primary\b/);
    expect(selected.className).not.toMatch(/\btext-primary-foreground\b/);
    expect(selected).toHaveClass("bg-background");
    expect(selected).toHaveClass("text-foreground");
  });

  // D-10 R2 (#483 round 2, blocker #3 — mixed control heights): see
  // MomentSwitcher.test.tsx's matching regression test for the root cause
  // (`.workflow-shell__nav`'s unlayered padding). This track shared the
  // same bug.
  it("the track carries no padding and does not use the workflow-shell__nav class (round-1 height-mismatch regression)", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    const track = screen.getByTestId("countdown-clock-toggle");
    expect(track.className).not.toMatch(/\bworkflow-shell__nav\b/);
    expect(track.className).not.toMatch(/\bp-1\b/);
  });

  // D-10 R2: real focus-visible ring using the app's own --ring token.
  it("segments carry the app's focus-visible ring token, not the browser default", () => {
    render(<CountdownClockToggle value="countdown" onChange={vi.fn()} />);
    const segment = screen.getByTestId("countdown-clock-toggle-clock");
    expect(segment).toHaveClass("outline-none");
    expect(segment).toHaveClass("focus-visible:ring-2");
    expect(segment).toHaveClass("focus-visible:ring-ring");
  });
});
