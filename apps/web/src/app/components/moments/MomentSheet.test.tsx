import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaptureOverlayOpenContext, MomentSheet } from "./MomentSheet";

describe("MomentSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MomentSheet open={false} title="Test" onClose={() => {}}>
        <p>content</p>
      </MomentSheet>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders as a dialog with the given title and children when open", () => {
    render(
      <MomentSheet open title="Triage" onClose={() => {}}>
        <p>body content</p>
      </MomentSheet>,
    );

    const dialog = screen.getByTestId("moment-sheet-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-label", "Triage");
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("focuses the dialog on open", async () => {
    render(
      <MomentSheet open title="Triage" onClose={() => {}}>
        <p>content</p>
      </MomentSheet>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("moment-sheet-dialog")).toHaveFocus();
    });
  });

  it("calls onClose when the scrim is clicked", () => {
    const onClose = vi.fn();
    render(
      <MomentSheet open title="Triage" onClose={onClose}>
        <p>content</p>
      </MomentSheet>,
    );

    fireEvent.click(screen.getByTestId("moment-sheet-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MomentSheet open title="Triage" onClose={onClose}>
        <p>content</p>
      </MomentSheet>,
    );

    fireEvent.click(screen.getByTestId("moment-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape while the dialog is focused", () => {
    const onClose = vi.fn();
    render(
      <MomentSheet open title="Triage" onClose={onClose}>
        <p>content</p>
      </MomentSheet>,
    );

    fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // SP-1: focus discipline — return-focus and the Tab trap layer on top of
  // the existing autofocus-on-open ("focuses the dialog on open" above) and
  // Escape behavior without changing either.
  describe("SP-1 focus discipline", () => {
    function OpenerHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            Open
          </button>
          <MomentSheet
            open={open}
            title="Triage"
            onClose={() => setOpen(false)}
          >
            <button data-testid="body-button">Body action</button>
          </MomentSheet>
        </div>
      );
    }

    it("returns focus to the opener once closed", async () => {
      render(<OpenerHarness />);
      const opener = screen.getByTestId("opener");
      opener.focus();
      fireEvent.click(opener);

      await waitFor(() => {
        expect(screen.getByTestId("moment-sheet-dialog")).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
        key: "Escape",
      });

      expect(opener).toHaveFocus();
    });

    it("traps Tab within the sheet", async () => {
      render(
        <MomentSheet open title="Triage" onClose={vi.fn()}>
          <button data-testid="body-button">Body action</button>
        </MomentSheet>,
      );

      const closeButton = screen.getByTestId("moment-sheet-close");
      const bodyButton = screen.getByTestId("body-button");

      // Close button is the first focusable in DOM order (it comes before
      // the children); Shift+Tab from it should wrap to the last focusable
      // (the body button), since the dialog shell's own tabIndex=-1 isn't a
      // Tab stop.
      closeButton.focus();
      expect(closeButton).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
        key: "Tab",
        shiftKey: true,
      });
      expect(bodyButton).toHaveFocus();

      // And Tab from the last focusable (body button) wraps back to first
      // (the close button).
      fireEvent.keyDown(screen.getByTestId("moment-sheet-dialog"), {
        key: "Tab",
      });
      expect(closeButton).toHaveFocus();
    });

    it("traps Tab even when focus is still on the dialog shell itself (the state right after autofocus-on-open)", async () => {
      render(
        <MomentSheet open title="Triage" onClose={vi.fn()}>
          <button data-testid="body-button">Body action</button>
        </MomentSheet>,
      );

      const dialog = screen.getByTestId("moment-sheet-dialog");
      const closeButton = screen.getByTestId("moment-sheet-close");
      const bodyButton = screen.getByTestId("body-button");

      await waitFor(() => {
        expect(dialog).toHaveFocus();
      });

      // The dialog's own tabIndex=-1 container is not itself one of the
      // trap's tracked focusables. Shift+Tab from here must still land on
      // the last focusable, not fall through to native tab order and
      // escape into the page behind the sheet.
      fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
      expect(bodyButton).toHaveFocus();

      bodyButton.blur();
      dialog.focus();
      expect(dialog).toHaveFocus();

      fireEvent.keyDown(dialog, { key: "Tab" });
      expect(closeButton).toHaveFocus();
    });
  });

  // SP-4: motion tokens only, with reduced-motion fallbacks on every
  // transitioned element.
  it("scrim and dialog use motion tokens with reduced-motion fallbacks", () => {
    render(
      <MomentSheet open title="Triage" onClose={() => {}}>
        <p>content</p>
      </MomentSheet>,
    );

    const scrim = screen.getByTestId("moment-sheet-scrim");
    expect(scrim).toHaveClass("motion-reduce:transition-none");
    expect(scrim).toHaveClass("motion-reduce:duration-0");
    expect(scrim.style.transitionDuration).toBe("var(--motion-base)");
    expect(scrim.style.transitionTimingFunction).toBe("var(--motion-ease)");

    const dialog = screen.getByTestId("moment-sheet-dialog");
    expect(dialog).toHaveClass("motion-reduce:transition-none");
    expect(dialog).toHaveClass("motion-reduce:duration-0");
    expect(dialog.style.transitionDuration).toBe("var(--motion-base)");
  });

  // #687 round-11 judge (DEFECT 1, "Escape means get me out, and only one
  // dialog owns focus"): capture is unconditionally the front dialog
  // whenever both it and a sheet are open (see this file's header). These
  // pin the SHEET's half of that contract at the unit tier — the e2e pin
  // (`nav-truth.spec.ts`, "direct URL naming both sheet and capture
  // composes...") proves the same thing against a real browser/dialog pair.
  describe("#687 DEFECT 1: obscured by an open capture overlay", () => {
    it("does not steal focus, trap Tab, or claim aria-modal while obscured", async () => {
      render(
        <CaptureOverlayOpenContext.Provider value={true}>
          <MomentSheet open title="Triage" onClose={vi.fn()}>
            <button data-testid="body-button">Body action</button>
          </MomentSheet>
        </CaptureOverlayOpenContext.Provider>,
      );

      const dialog = screen.getByTestId("moment-sheet-dialog");
      // Give the (suppressed) autofocus rAF a chance to have fired if it
      // were going to — it must not.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(dialog).not.toHaveFocus();
      expect(dialog).not.toHaveAttribute("aria-modal", "true");
      expect(screen.getByTestId("moment-sheet")).toHaveAttribute("inert", "");

      // Tab trap is off: Tab on the dialog does nothing (no focusable
      // element gets force-moved), unlike the un-obscured "traps Tab"
      // test above.
      const bodyButton = screen.getByTestId("body-button");
      bodyButton.focus();
      fireEvent.keyDown(dialog, { key: "Tab" });
      expect(bodyButton).toHaveFocus();
    });

    it("reclaims focus, the Tab trap, and aria-modal the instant capture closes — no click required", async () => {
      function Harness() {
        const [captureOpen, setCaptureOpen] = useState(true);
        return (
          <div>
            <button
              data-testid="close-capture"
              onClick={() => setCaptureOpen(false)}
            >
              Close capture
            </button>
            <CaptureOverlayOpenContext.Provider value={captureOpen}>
              <MomentSheet open title="Triage" onClose={vi.fn()}>
                <p>content</p>
              </MomentSheet>
            </CaptureOverlayOpenContext.Provider>
          </div>
        );
      }

      render(<Harness />);
      const dialog = screen.getByTestId("moment-sheet-dialog");
      expect(dialog).not.toHaveAttribute("aria-modal", "true");

      // Simulates capture closing (obscured -> false) — no click on the
      // sheet itself anywhere in this sequence.
      fireEvent.click(screen.getByTestId("close-capture"));

      await waitFor(() => {
        expect(dialog).toHaveFocus();
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(screen.getByTestId("moment-sheet")).not.toHaveAttribute("inert");
    });

    it("does not regress the un-obscured autofocus race: a fresh, never-obscured open still focuses immediately", async () => {
      render(
        <CaptureOverlayOpenContext.Provider value={false}>
          <MomentSheet open title="Triage" onClose={vi.fn()}>
            <p>content</p>
          </MomentSheet>
        </CaptureOverlayOpenContext.Provider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("moment-sheet-dialog")).toHaveFocus();
      });
    });
  });

  // SP-9: the close button reaches a >=44px effective hit area and drops
  // the 300ms double-tap delay on coarse pointers.
  it("close button carries hit-area and touch-manipulation utilities", () => {
    render(
      <MomentSheet open title="Triage" onClose={() => {}}>
        <p>content</p>
      </MomentSheet>,
    );

    const closeButton = screen.getByTestId("moment-sheet-close");
    expect(closeButton).toHaveClass("min-h-[44px]");
    expect(closeButton).toHaveClass("touch-manipulation");
  });
});
