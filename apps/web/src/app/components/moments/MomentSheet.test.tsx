import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MomentSheet } from "./MomentSheet";

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
});
