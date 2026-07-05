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
});
