import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaptureOverlay } from "./CaptureOverlay";

const KINDS = ["Task", "Note", "Idea"];

describe("CaptureOverlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CaptureOverlay
        open={false}
        kinds={KINDS}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("autofocuses the textarea when opened", async () => {
    render(
      <CaptureOverlay open kinds={KINDS} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
    });
  });

  it("saves with the selected kind on Enter and clears the field", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay open kinds={KINDS} onSave={onSave} onClose={vi.fn()} />,
    );

    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId("capture-overlay-kind-Note"));
    fireEvent.change(textarea, { target: { value: "Buy milk" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("Buy milk", "Note", null);
    expect(textarea.value).toBe("");
  });

  it("saves the editable return hook with the capture", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay open kinds={KINDS} onSave={onSave} onClose={vi.fn()} />,
    );

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
      "Task",
      "finish weekly review",
    );
  });

  it("does not save on Shift+Enter", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay open kinds={KINDS} onSave={onSave} onClose={vi.fn()} />,
    );
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CaptureOverlay open kinds={KINDS} onSave={vi.fn()} onClose={onClose} />,
    );
    const textarea = screen.getByTestId("capture-overlay-textarea");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects a kind chip, defaulting to the first kind", () => {
    render(
      <CaptureOverlay open kinds={KINDS} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId("capture-overlay-kind-Task")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByTestId("capture-overlay-kind-Idea"));
    expect(screen.getByTestId("capture-overlay-kind-Idea")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("capture-overlay-kind-Task")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // SP-5: never lose typed capture text. These cover the CaptureOverlay half
  // of the contract in isolation (seeding, hint, cursor position, reporting
  // keystrokes upward); TodayMoments.test.tsx covers the sessionStorage
  // read/write + clear-on-save + ritual-safety wiring end to end.
  describe("SP-5 draft seeding", () => {
    it("seeds the textarea from initialText and shows the restored hint, with the cursor at the end", async () => {
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
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
      expect(
        screen.getByTestId("capture-overlay-draft-restored"),
      ).toHaveTextContent("Draft restored");
    });

    it("does not show the restored hint when initialText is empty or omitted", () => {
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(
        screen.queryByTestId("capture-overlay-draft-restored"),
      ).not.toBeInTheDocument();
    });

    it("reports every keystroke via onDraftChange without requiring it", () => {
      const onDraftChange = vi.fn();
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
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
            kinds={KINDS}
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
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );
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
  it("scrim, dialog, and kind chips use motion tokens with reduced-motion fallbacks", () => {
    render(
      <CaptureOverlay open kinds={KINDS} onSave={vi.fn()} onClose={vi.fn()} />,
    );

    const scrim = screen.getByTestId("capture-overlay-scrim");
    expect(scrim).toHaveClass("motion-reduce:transition-none");
    expect(scrim).toHaveClass("motion-reduce:duration-0");
    expect(scrim.style.transitionDuration).toBe("var(--motion-base)");
    expect(scrim.style.transitionTimingFunction).toBe("var(--motion-ease)");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("motion-reduce:transition-none");
    expect(dialog).toHaveClass("motion-reduce:duration-0");
    expect(dialog.style.transitionDuration).toBe("var(--motion-base)");

    const kindChip = screen.getByTestId("capture-overlay-kind-Task");
    expect(kindChip).toHaveClass("duration-[var(--motion-fast)]");
    expect(kindChip).toHaveClass("ease-[var(--motion-ease)]");
    expect(kindChip).toHaveClass("motion-reduce:transition-none");
    expect(kindChip).toHaveClass("motion-reduce:duration-0");
  });

  // SP-9: every tappable element reaches a >=44px effective hit area and
  // drops the 300ms double-tap delay on coarse pointers.
  it("kind chips and the close button carry hit-area and touch-manipulation utilities", () => {
    render(
      <CaptureOverlay open kinds={KINDS} onSave={vi.fn()} onClose={vi.fn()} />,
    );

    const kindChip = screen.getByTestId("capture-overlay-kind-Task");
    expect(kindChip).toHaveClass("min-h-[44px]");
    expect(kindChip).toHaveClass("min-w-[44px]");
    expect(kindChip).toHaveClass("touch-manipulation");

    const closeButton = screen.getByTestId("capture-overlay-close");
    expect(closeButton).toHaveClass("min-h-[44px]");
    expect(closeButton).toHaveClass("touch-manipulation");
  });

  // G1 floor follow-up: the optional "save raw" action.
  describe("save raw", () => {
    it("does not render the save-raw button unless onSaveRaw is provided", () => {
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(
        screen.queryByTestId("capture-overlay-save-raw"),
      ).not.toBeInTheDocument();
    });

    it("fires onSaveRaw with the trimmed text, kind, and hook, then clears", () => {
      const onSave = vi.fn();
      const onSaveRaw = vi.fn();
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
          onSave={onSave}
          onSaveRaw={onSaveRaw}
          onClose={vi.fn()}
        />,
      );

      const textarea = screen.getByTestId(
        "capture-overlay-textarea",
      ) as HTMLTextAreaElement;
      fireEvent.click(screen.getByTestId("capture-overlay-kind-Idea"));
      fireEvent.change(textarea, { target: { value: "  loose thought  " } });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "back to planning" },
      });
      fireEvent.click(screen.getByTestId("capture-overlay-save-raw"));

      expect(onSaveRaw).toHaveBeenCalledWith(
        "loose thought",
        "Idea",
        "back to planning",
      );
      // Save raw is the alternative to parse-and-save, not an addition to it.
      expect(onSave).not.toHaveBeenCalled();
      expect(textarea.value).toBe("");
    });

    it("does not fire onSaveRaw for empty or whitespace-only text", () => {
      const onSaveRaw = vi.fn();
      render(
        <CaptureOverlay
          open
          kinds={KINDS}
          onSave={vi.fn()}
          onSaveRaw={onSaveRaw}
          onClose={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "   " },
      });
      fireEvent.click(screen.getByTestId("capture-overlay-save-raw"));
      expect(onSaveRaw).not.toHaveBeenCalled();
    });
  });
});
