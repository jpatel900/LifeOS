import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

/**
 * SP-1 packet: focus discipline.
 *
 * jsdom does not move focus on a raw Tab keypress (no native tab-order
 * traversal), so the trap is exercised via its keydown handler directly:
 * focus the last focusable and dispatch Tab, assert focus moved to the
 * first; focus the first and dispatch Shift+Tab, assert it wrapped to the
 * last. A non-Tab key must never be intercepted.
 */

function Dialog({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(active, containerRef);
  return (
    <div ref={containerRef} data-testid="dialog">
      <button data-testid="first">First</button>
      <button data-testid="middle">Middle</button>
      <button data-testid="last">Last</button>
    </div>
  );
}

function SingleFocusableDialog({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(active, containerRef);
  return (
    <div ref={containerRef} data-testid="dialog">
      <input data-testid="only" />
    </div>
  );
}

describe("useFocusTrap", () => {
  it("wraps Tab from the last focusable back to the first", () => {
    render(<Dialog active />);
    const last = screen.getByTestId("last");
    const first = screen.getByTestId("first");
    last.focus();
    expect(last).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Tab" });

    expect(first).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    render(<Dialog active />);
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");
    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId("dialog"), {
      key: "Tab",
      shiftKey: true,
    });

    expect(last).toHaveFocus();
  });

  it("does not intercept a non-Tab key", () => {
    render(<Dialog active />);
    const middle = screen.getByTestId("middle");
    middle.focus();

    const event = fireEvent.keyDown(screen.getByTestId("dialog"), {
      key: "Escape",
    });

    // Not prevented, and focus is untouched by the trap.
    expect(event).toBe(true);
    expect(middle).toHaveFocus();
  });

  it("keeps focus on the only focusable element when Tab or Shift+Tab fires", () => {
    render(<SingleFocusableDialog active />);
    const only = screen.getByTestId("only");
    only.focus();

    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Tab" });
    expect(only).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId("dialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(only).toHaveFocus();
  });

  it("does nothing when inactive", () => {
    render(<Dialog active={false} />);
    const last = screen.getByTestId("last");
    last.focus();

    fireEvent.keyDown(screen.getByTestId("dialog"), { key: "Tab" });

    // No trap attached: focus is left exactly where the browser would have
    // put it natively (jsdom doesn't move it), so it just stays on "last".
    expect(last).toHaveFocus();
  });
});
