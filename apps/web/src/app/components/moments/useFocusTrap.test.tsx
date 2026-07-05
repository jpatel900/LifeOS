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

// Mirrors MomentSheet exactly: the dialog shell itself is a tabIndex=-1
// programmatic-focus target (not one of the tracked focusables), which is
// where focus actually sits right after autofocus-on-open.
function ContainerFocusedDialog({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(active, containerRef);
  return (
    <div ref={containerRef} tabIndex={-1} data-testid="dialog">
      <button data-testid="first">First</button>
      <button data-testid="last">Last</button>
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

  it("treats focus sitting on the tabIndex=-1 container itself as a boundary, not as 'inside, do nothing'", () => {
    // Regression: right after autofocus-on-open, focus is on the dialog
    // shell (a tabIndex=-1 container), which is not one of the tracked
    // focusables. Both Tab and Shift+Tab from there must land inside the
    // trap (first/last respectively) rather than falling through to
    // native tab order and escaping into the page behind the dialog.
    render(<ContainerFocusedDialog active />);
    const dialog = screen.getByTestId("dialog");
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");

    dialog.focus();
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    last.blur();
    dialog.focus();
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();
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
