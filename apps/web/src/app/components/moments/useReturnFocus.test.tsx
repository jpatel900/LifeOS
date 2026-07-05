import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useReturnFocus } from "./useReturnFocus";

/**
 * SP-1 packet: focus discipline.
 *
 * Covers the return-focus contract in isolation: capture the opener on
 * activate, restore it on deactivate/unmount, and no-op gracefully if the
 * opener was removed from the DOM before the restore fires.
 *
 * The overlay stand-in autofocuses its input via requestAnimationFrame,
 * mirroring CaptureOverlay/CommandPalette/MomentSheet exactly — this is
 * what makes the ordering guarantee (capture-before-autofocus) meaningful:
 * a synchronous `useEffect` runs before a rAF callback fires, so
 * `useReturnFocus`'s capture sees the opener, not the overlay's own input.
 */

function Overlay({
  active,
  autofocus = true,
}: {
  active: boolean;
  autofocus?: boolean;
}) {
  useReturnFocus(active);
  if (!active) return null;
  return (
    <div>
      {autofocus ? <AutofocusInput /> : <input data-testid="overlay-input" />}
    </div>
  );
}

function AutofocusInput() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  return <input ref={ref} data-testid="overlay-input" />;
}

function Harness({
  active,
  showOpener = true,
}: {
  active: boolean;
  showOpener?: boolean;
}) {
  return (
    <div>
      {showOpener ? <button data-testid="opener">Open</button> : null}
      <Overlay active={active} />
    </div>
  );
}

describe("useReturnFocus", () => {
  it("restores focus to the opener once the overlay closes", async () => {
    const { rerender } = render(<Harness active={false} />);

    const opener = screen.getByTestId("opener");
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(<Harness active />);
    await waitFor(() => {
      expect(screen.getByTestId("overlay-input")).toHaveFocus();
    });

    rerender(<Harness active={false} />);
    expect(screen.getByTestId("opener")).toHaveFocus();
  });

  it("restores focus on unmount, not just on active flipping false", () => {
    function Wrapper({ mounted }: { mounted: boolean }) {
      return (
        <div>
          <button data-testid="opener">Open</button>
          {mounted ? <Overlay active autofocus={false} /> : null}
        </div>
      );
    }

    const { rerender } = render(<Wrapper mounted={false} />);
    const opener = screen.getByTestId("opener");
    opener.focus();

    rerender(<Wrapper mounted />);
    screen.getByTestId("overlay-input").focus();
    expect(screen.getByTestId("overlay-input")).toHaveFocus();

    rerender(<Wrapper mounted={false} />);
    expect(screen.getByTestId("opener")).toHaveFocus();
  });

  it("does not throw and no-ops when the opener was removed from the DOM before close", () => {
    const { rerender } = render(<Harness active={false} showOpener />);

    const opener = screen.getByTestId("opener");
    opener.focus();

    rerender(<Harness active showOpener={false} />);

    expect(() => {
      rerender(<Harness active={false} showOpener={false} />);
    }).not.toThrow();
  });

  it("is a no-op when the element saved had no meaningful prior focus (body)", () => {
    // document.body is the default activeElement when nothing else has focus.
    expect(document.activeElement).toBe(document.body);

    const onRender = vi.fn();
    function BodyHarness({ active }: { active: boolean }) {
      onRender();
      useReturnFocus(active);
      return null;
    }

    const { rerender } = render(<BodyHarness active />);
    expect(() => rerender(<BodyHarness active={false} />)).not.toThrow();
  });
});
