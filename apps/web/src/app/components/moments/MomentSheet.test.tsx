import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
