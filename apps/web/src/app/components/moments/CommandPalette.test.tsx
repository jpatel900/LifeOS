import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette, type CommandPaletteAction } from "./CommandPalette";

const ACTIONS: CommandPaletteAction[] = [
  { id: "start", label: "Switch to Start", hint: "1" },
  { id: "flow", label: "Switch to Flow", hint: "2" },
  { id: "close", label: "Switch to Close", hint: "3" },
  { id: "capture", label: "Open capture", hint: "C" },
];

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette
        open={false}
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("filters actions by a case-insensitive substring", () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "CAPTURE" },
    });

    expect(
      screen.getByTestId("command-palette-option-capture"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("command-palette-option-start"),
    ).not.toBeInTheDocument();
  });

  it("moves the highlighted row with arrow keys (wrapping) and runs it on Enter", () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette open actions={ACTIONS} onRun={onRun} onClose={onClose} />,
    );

    const input = screen.getByTestId("command-palette-input");
    // Starts highlighted on the first row ("start"); move down to "flow".
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Wrap back up past the top to the last row ("capture").
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRun).toHaveBeenCalledWith("capture");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(screen.getByTestId("command-palette-input"), {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("runs the clicked action directly", () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette open actions={ACTIONS} onRun={onRun} onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId("command-palette-option-flow"));

    expect(onRun).toHaveBeenCalledWith("flow");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("autofocuses the input when opened", async () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("command-palette-input")).toHaveFocus();
    });
  });

  // SP-1: focus discipline — return-focus and the Tab trap layer on top of
  // the existing autofocus/Escape/arrow-nav behavior without changing it.
  describe("SP-1 focus discipline", () => {
    function OpenerHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            Open
          </button>
          <CommandPalette
            open={open}
            actions={ACTIONS}
            onRun={vi.fn()}
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
        expect(screen.getByTestId("command-palette-input")).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId("command-palette-input"), {
        key: "Escape",
      });

      expect(opener).toHaveFocus();
    });

    it("traps Tab within the palette (input is the only focusable element)", async () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const input = screen.getByTestId("command-palette-input");
      await waitFor(() => {
        expect(input).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
      expect(input).toHaveFocus();

      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Tab",
        shiftKey: true,
      });
      expect(input).toHaveFocus();
    });
  });

  // SP-4: motion tokens only, with reduced-motion fallbacks on every
  // transitioned element.
  it("scrim and dialog use motion tokens with reduced-motion fallbacks", () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const scrim = screen.getByTestId("command-palette-scrim");
    expect(scrim).toHaveClass("motion-reduce:transition-none");
    expect(scrim).toHaveClass("motion-reduce:duration-0");
    expect(scrim.style.transitionDuration).toBe("var(--motion-base)");
    expect(scrim.style.transitionTimingFunction).toBe("var(--motion-ease)");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("motion-reduce:transition-none");
    expect(dialog).toHaveClass("motion-reduce:duration-0");
    expect(dialog.style.transitionDuration).toBe("var(--motion-base)");
  });
});
