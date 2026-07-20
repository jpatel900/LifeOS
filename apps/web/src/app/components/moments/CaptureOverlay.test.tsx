import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaptureOverlay } from "./CaptureOverlay";

describe("CaptureOverlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CaptureOverlay open={false} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("autofocuses the textarea when opened", async () => {
    render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
    });
  });

  it("saves on Enter and clears the field", () => {
    const onSave = vi.fn();
    render(<CaptureOverlay open onSave={onSave} onClose={vi.fn()} />);

    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Buy milk" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("Buy milk", null);
  });

  it("saves the editable return hook with the capture", () => {
    const onSave = vi.fn();
    render(<CaptureOverlay open onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
      target: { value: "Remember the renewal" },
    });
    fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
      target: { value: "finish weekly review" },
    });
    fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
      key: "Enter",
    });

    expect(onSave).toHaveBeenCalledWith(
      "Remember the renewal",
      "finish weekly review",
    );
  });

  it("does not save on Shift+Enter", () => {
    const onSave = vi.fn();
    render(<CaptureOverlay open onSave={onSave} onClose={vi.fn()} />);
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes on Escape while idle", () => {
    const onClose = vi.fn();
    render(<CaptureOverlay open onSave={vi.fn()} onClose={onClose} />);
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // SP-5: unsaved text must survive an accidental close/reopen within the
  // session. These cover the CaptureOverlay half of the contract in
  // isolation (seeding, hint, cursor position, reporting keystrokes
  // upward); TodayMoments.test.tsx covers the sessionStorage read/write +
  // clear-on-save + ritual-safety wiring end to end.
  describe("SP-5 draft seeding", () => {
    it("seeds the textarea from initialText, with the cursor at the end", async () => {
      render(
        <CaptureOverlay
          open
          initialText="half a thought"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const textarea = screen.getByTestId(
        "capture-overlay-textarea",
      ) as HTMLTextAreaElement;

      await waitFor(() => {
        expect(textarea).toHaveFocus();
      });
      expect(textarea.value).toBe("half a thought");
      expect(textarea.selectionStart).toBe("half a thought".length);
      expect(textarea.selectionEnd).toBe("half a thought".length);
    });

    it("reports every keystroke via onDraftChange without requiring it", () => {
      const onDraftChange = vi.fn();
      render(
        <CaptureOverlay
          open
          onSave={vi.fn()}
          onClose={vi.fn()}
          onDraftChange={onDraftChange}
        />,
      );
      const textarea = screen.getByTestId("capture-overlay-textarea");
      fireEvent.change(textarea, { target: { value: "a stray thought" } });
      expect(onDraftChange).toHaveBeenCalledWith("a stray thought");
    });
  });

  // SP-1: focus discipline — return-focus and the Tab trap layer on top of
  // the existing autofocus/Escape behavior without changing it (the
  // "autofocuses the textarea when opened" test above already proves
  // autofocus survives the wiring).
  describe("SP-1 focus discipline", () => {
    function OpenerHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            Open
          </button>
          <CaptureOverlay
            open={open}
            onSave={vi.fn()}
            onClose={() => setOpen(false)}
          />
        </div>
      );
    }

    it("returns focus to the opener once closed", async () => {
      render(<OpenerHarness />);
      const opener = screen.getByTestId("opener");
      opener.focus();
      fireEvent.click(opener);

      await waitFor(() => {
        expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Escape",
      });

      expect(opener).toHaveFocus();
    });

    it("traps Tab within the dialog", async () => {
      render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
      });

      const closeButton = screen.getByTestId("capture-overlay-close");
      closeButton.focus();
      expect(closeButton).toHaveFocus();

      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Tab",
      });

      expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
    });
  });

  // SP-4: motion tokens only, exits no slower than entrances, and every
  // transitioned element must fall back to no motion for
  // prefers-reduced-motion users.
  it("scrim and dialog use motion tokens with reduced-motion fallbacks", () => {
    render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);

    const scrim = screen.getByTestId("capture-overlay-scrim");
    expect(scrim).toHaveClass("motion-reduce:transition-none");
    expect(scrim).toHaveClass("motion-reduce:duration-0");
    expect(scrim.style.transitionDuration).toBe("var(--motion-base)");
    expect(scrim.style.transitionTimingFunction).toBe("var(--motion-ease)");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("motion-reduce:transition-none");
    expect(dialog).toHaveClass("motion-reduce:duration-0");
    expect(dialog.style.transitionDuration).toBe("var(--motion-base)");
  });

  // SP-9: every tappable element reaches a >=44px effective hit area and
  // drops the 300ms double-tap delay on coarse pointers.
  it("the close button carries hit-area and touch-manipulation utilities", () => {
    render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);

    const closeButton = screen.getByTestId("capture-overlay-close");
    expect(closeButton).toHaveClass("min-h-[44px]");
    expect(closeButton).toHaveClass("touch-manipulation");
  });

  // #703: one action. The overlay used to render a "save raw" button next
  // to a parse-and-save button, and to own the whole FR-026 parse-wait
  // containment sequence (raw text held through the wait, second submit
  // blocked, degraded mock-retry offer). Capture no longer parses, so none
  // of those states are reachable from here — the degraded/mock-retry path
  // is proven at its new home in TriageSheet.test.tsx.
  describe("#703 one capture action", () => {
    it("renders a single save control and no save-raw alternative", () => {
      render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByTestId("capture-overlay-save")).toHaveTextContent(
        "Capture",
      );
      expect(
        screen.queryByTestId("capture-overlay-save-raw"),
      ).not.toBeInTheDocument();
    });

    it("clicking Capture saves the trimmed text and hook", () => {
      const onSave = vi.fn();
      render(<CaptureOverlay open onSave={onSave} onClose={vi.fn()} />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "  loose thought  " },
      });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "back to planning" },
      });
      fireEvent.click(screen.getByTestId("capture-overlay-save"));

      expect(onSave).toHaveBeenCalledWith("loose thought", "back to planning");
    });

    it("does not save empty or whitespace-only text", () => {
      const onSave = vi.fn();
      render(<CaptureOverlay open onSave={onSave} onClose={vi.fn()} />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "   " },
      });
      fireEvent.click(screen.getByTestId("capture-overlay-save"));

      expect(onSave).not.toHaveBeenCalled();
    });

    it("shows no parse wait and no degraded offer", () => {
      render(<CaptureOverlay open onSave={vi.fn()} onClose={vi.fn()} />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Enter",
      });

      expect(
        screen.queryByTestId("capture-overlay-parsing"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("capture-overlay-degraded"),
      ).not.toBeInTheDocument();
    });

    it("still ends with the 'back to: <hook>' conclusion", async () => {
      const onResolved = vi.fn();
      render(
        <CaptureOverlay
          open
          onSave={vi.fn()}
          onClose={vi.fn()}
          onResolved={onResolved}
        />,
      );

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "the weekly review" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Enter",
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("capture-overlay-conclusion"),
        ).toHaveTextContent("back to: the weekly review");
      });
    });
  });
});
