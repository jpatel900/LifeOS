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
});
