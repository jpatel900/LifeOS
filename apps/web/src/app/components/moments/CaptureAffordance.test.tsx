import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptureAffordance } from "./CaptureAffordance";

describe("CaptureAffordance", () => {
  it("fires onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<CaptureAffordance onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("capture-affordance"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // SP-4: the hover scale transition uses the fast motion token and falls
  // back to no motion (and no hover scale) for prefers-reduced-motion users.
  it("uses the fast motion token with a reduced-motion fallback", () => {
    render(<CaptureAffordance onOpen={vi.fn()} />);
    const button = screen.getByTestId("capture-affordance");
    expect(button).toHaveClass("duration-[var(--motion-fast)]");
    expect(button).toHaveClass("ease-[var(--motion-ease)]");
    expect(button).toHaveClass("motion-reduce:transition-none");
    expect(button).toHaveClass("motion-reduce:duration-0");
    expect(button).toHaveClass("motion-reduce:hover:scale-100");
  });
});
