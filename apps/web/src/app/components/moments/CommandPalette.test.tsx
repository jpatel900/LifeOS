import { render, screen, fireEvent } from "@testing-library/react";
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
});
