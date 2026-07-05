import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

    expect(onSave).toHaveBeenCalledWith("Buy milk", "Note");
    expect(textarea.value).toBe("");
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
});
