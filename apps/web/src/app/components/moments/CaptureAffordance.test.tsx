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

  it("blocks opening a second capture while containment is active", () => {
    const onOpen = vi.fn();
    render(<CaptureAffordance disabled onOpen={onOpen} />);
    const button = screen.getByTestId("capture-affordance");

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Capture resolving");
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
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

  // SP-9: the capture affordance reaches a >=44px effective hit area and
  // drops the 300ms double-tap delay on coarse pointers.
  it("carries hit-area and touch-manipulation utilities", () => {
    render(<CaptureAffordance onOpen={vi.fn()} />);
    const button = screen.getByTestId("capture-affordance");
    expect(button).toHaveClass("min-h-[44px]");
    expect(button).toHaveClass("touch-manipulation");
  });

  // G1 floor follow-up: the offline-queue badge.
  it("shows no queue badge when nothing is waiting to sync", () => {
    const { unmount } = render(<CaptureAffordance onOpen={vi.fn()} />);
    expect(screen.queryByTestId("capture-queue-badge")).toBeNull();
    unmount();

    render(<CaptureAffordance onOpen={vi.fn()} unsyncedCount={0} />);
    expect(screen.queryByTestId("capture-queue-badge")).toBeNull();
  });

  it("surfaces the unsynced count with a colour-independent label", () => {
    render(<CaptureAffordance onOpen={vi.fn()} unsyncedCount={3} />);
    const badge = screen.getByTestId("capture-queue-badge");

    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveTextContent("3 captures waiting to sync");
    // stable-width digits so the count does not jitter as it changes
    expect(badge).toHaveClass("tabular-nums");
  });

  it("uses the singular noun for a single pending capture", () => {
    render(<CaptureAffordance onOpen={vi.fn()} unsyncedCount={1} />);
    expect(screen.getByTestId("capture-queue-badge")).toHaveTextContent(
      "1 capture waiting to sync",
    );
  });
});
