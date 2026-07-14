import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CaptureOverlay } from "./CaptureOverlay";
import type { CaptureParseState } from "@/lib/WorkflowContext";

const IDLE: CaptureParseState = { phase: "idle" };

describe("CaptureOverlay", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CaptureOverlay
        open={false}
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={vi.fn()}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("autofocuses the textarea when opened", async () => {
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={vi.fn()}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("capture-overlay-textarea")).toHaveFocus();
    });
  });

  it("saves on Enter and clears the field", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={onSave}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Buy milk" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("Buy milk", null);
  });

  it("saves the editable return hook with the capture", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={onSave}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
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
      "finish weekly review",
    );
  });

  it("does not save on Shift+Enter", () => {
    const onSave = vi.fn();
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={onSave}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const textarea = screen.getByTestId(
      "capture-overlay-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes on Escape while idle", () => {
    const onClose = vi.fn();
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={vi.fn()}
        onSaveRaw={vi.fn()}
        onClose={onClose}
      />,
    );
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
          captureParse={IDLE}
          onRetryWithMock={vi.fn()}
          initialText="half a thought"
          onSave={vi.fn()}
          onSaveRaw={vi.fn()}
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
          captureParse={IDLE}
          onRetryWithMock={vi.fn()}
          onSave={vi.fn()}
          onSaveRaw={vi.fn()}
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
            captureParse={IDLE}
            onRetryWithMock={vi.fn()}
            onSave={vi.fn()}
            onSaveRaw={vi.fn()}
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
          captureParse={IDLE}
          onRetryWithMock={vi.fn()}
          onSave={vi.fn()}
          onSaveRaw={vi.fn()}
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
  it("scrim and dialog use motion tokens with reduced-motion fallbacks", () => {
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={vi.fn()}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
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
  });

  // SP-9: every tappable element reaches a >=44px effective hit area and
  // drops the 300ms double-tap delay on coarse pointers.
  it("the close button carries hit-area and touch-manipulation utilities", () => {
    render(
      <CaptureOverlay
        open
        captureParse={IDLE}
        onRetryWithMock={vi.fn()}
        onSave={vi.fn()}
        onSaveRaw={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const closeButton = screen.getByTestId("capture-overlay-close");
    expect(closeButton).toHaveClass("min-h-[44px]");
    expect(closeButton).toHaveClass("touch-manipulation");
  });

  // G1 floor follow-up: the "save raw" action, now always visible (not an
  // optional prop) — #556 requires a visible parsed-save action to exist
  // alongside it, not Enter-only.
  describe("save raw", () => {
    it("fires onSaveRaw with the trimmed text and hook, then clears", () => {
      const onSave = vi.fn();
      const onSaveRaw = vi.fn();
      render(
        <CaptureOverlay
          open
          captureParse={IDLE}
          onRetryWithMock={vi.fn()}
          onSave={onSave}
          onSaveRaw={onSaveRaw}
          onClose={vi.fn()}
          onResolved={vi.fn()}
        />,
      );

      const textarea = screen.getByTestId(
        "capture-overlay-textarea",
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "  loose thought  " } });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "back to planning" },
      });
      fireEvent.click(screen.getByTestId("capture-overlay-save-raw"));

      expect(onSaveRaw).toHaveBeenCalledWith(
        "loose thought",
        "back to planning",
      );
      // Save raw is the alternative to parse-and-save, not an addition to it.
      expect(onSave).not.toHaveBeenCalled();
    });

    it("does not fire onSaveRaw for empty or whitespace-only text", () => {
      const onSaveRaw = vi.fn();
      render(
        <CaptureOverlay
          open
          captureParse={IDLE}
          onRetryWithMock={vi.fn()}
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

  // #556 FR-026 containment — the sequence a parse-triggering save must
  // follow: raw text + hook stay visible through the wait, no second
  // submit is possible, a failed parse offers a synchronous choice (never
  // fire-and-forget), and the flow ends with "back to: <hook>".
  describe("#556 FR-026 containment", () => {
    function ContainmentHarness({
      onResolved = vi.fn(),
    }: {
      onResolved?: (outcome: string) => void;
    }) {
      const [captureParse, setCaptureParse] = useState<CaptureParseState>(IDLE);
      const onRetryWithMock = vi.fn(() => {
        setCaptureParse((current) =>
          current.phase === "failed"
            ? {
                phase: "parsing",
                captureId: current.captureId,
                parserMode: "mock",
              }
            : current,
        );
      });
      return (
        <div>
          <button
            data-testid="resolve-parsed"
            onClick={() =>
              setCaptureParse((current) =>
                current.phase === "parsing"
                  ? {
                      phase: "parsed",
                      captureId: current.captureId,
                      parser: "mock",
                      status: "ai_unavailable",
                    }
                  : current,
              )
            }
          >
            resolve
          </button>
          <button
            data-testid="fail-parse"
            onClick={() =>
              setCaptureParse((current) =>
                current.phase === "parsing"
                  ? {
                      phase: "failed",
                      captureId: current.captureId,
                      status: "ai_unavailable",
                      message: "Parsing failed safely.",
                      canRetryWithMock: true,
                    }
                  : current,
              )
            }
          >
            fail
          </button>
          <CaptureOverlay
            open
            captureParse={captureParse}
            onRetryWithMock={onRetryWithMock}
            onSave={(text) => {
              setCaptureParse({
                phase: "parsing",
                captureId: "cap-1",
                parserMode: "auto",
              });
              return "cap-1";
            }}
            onSaveRaw={vi.fn()}
            onClose={vi.fn()}
            onResolved={(outcome) => onResolved(outcome)}
          />
        </div>
      );
    }

    it("keeps the raw text and hook visible through the wait and blocks a second submit", async () => {
      render(<ContainmentHarness />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "the weekly review" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Enter",
      });

      // t=0..resolve: raw text and hook stay fully visible, not cleared.
      expect(
        (screen.getByTestId("capture-overlay-textarea") as HTMLTextAreaElement)
          .value,
      ).toBe("Follow up with Alex");
      expect(
        (screen.getByTestId("capture-overlay-return-hook") as HTMLInputElement)
          .value,
      ).toBe("the weekly review");
      expect(screen.getByTestId("capture-overlay-parsing")).toBeVisible();

      // No new capture can begin: both save actions and Close are disabled.
      expect(screen.getByTestId("capture-overlay-save")).toBeDisabled();
      expect(screen.getByTestId("capture-overlay-save-raw")).toBeDisabled();
      expect(screen.getByTestId("capture-overlay-close")).toBeDisabled();

      // Escape is swallowed while a parse is in flight — never abandons the
      // return-hook context mid-wait.
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Escape",
      });
      expect(screen.getByTestId("capture-overlay-textarea")).toBeVisible();
    });

    it("shows the 'back to: <hook>' conclusion once the parse resolves", async () => {
      const onResolved = vi.fn();
      render(<ContainmentHarness onResolved={onResolved} />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.change(screen.getByTestId("capture-overlay-return-hook"), {
        target: { value: "the weekly review" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Enter",
      });

      fireEvent.click(screen.getByTestId("resolve-parsed"));

      await waitFor(() => {
        expect(
          screen.getByTestId("capture-overlay-conclusion"),
        ).toHaveTextContent("back to: the weekly review");
      });

      await waitFor(() => {
        expect(onResolved).toHaveBeenCalledWith("parsed");
      });
    });

    it("offers a synchronous mock-retry or keep-as-raw choice when the parse fails, never fire-and-forget", async () => {
      render(<ContainmentHarness />);

      fireEvent.change(screen.getByTestId("capture-overlay-textarea"), {
        target: { value: "Follow up with Alex" },
      });
      fireEvent.keyDown(screen.getByTestId("capture-overlay-textarea"), {
        key: "Enter",
      });

      fireEvent.click(screen.getByTestId("fail-parse"));

      const degraded = await screen.findByTestId("capture-overlay-degraded");
      expect(degraded).toHaveTextContent("Parsing failed safely.");
      expect(screen.getByTestId("capture-overlay-retry-mock")).toBeVisible();
      expect(screen.getByTestId("capture-overlay-keep-raw")).toBeVisible();

      // The raw text is still visible — nothing was lost while degraded.
      expect(
        (screen.getByTestId("capture-overlay-textarea") as HTMLTextAreaElement)
          .value,
      ).toBe("Follow up with Alex");
    });
  });
});
