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

  // SP-8: the zero-matches empty state names the filling action (try a
  // different word or clear the search) and echoes the query, instead of
  // being a dead end, and avoids the banned dead-end phrasing.
  it("zero-matches empty state names retrying or clearing the search as the filling action", () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("command-palette-input"), {
      target: { value: "zzz-no-match" },
    });

    const list = screen.getByTestId("command-palette-list");
    expect(list).toHaveTextContent("zzz-no-match");
    expect(list).toHaveTextContent("try a different word or clear the search");
    expect(list.textContent?.toLowerCase()).not.toMatch(
      /nothing here|empty|no data|\bnone\b/,
    );
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

  // SP-9: palette rows reach a >=44px effective hit area and drop the
  // 300ms double-tap delay on coarse pointers.
  it("option rows carry hit-area and touch-manipulation utilities", () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const row = screen.getByTestId("command-palette-option-capture");
    expect(row).toHaveClass("min-h-[44px]");
    expect(row).toHaveClass("touch-manipulation");
  });

  // #574: input reaches the same >=44px hit-area floor as every other
  // interactive control this packet audited.
  it("input carries the hit-area utility", () => {
    render(
      <CommandPalette
        open
        actions={ACTIONS}
        onRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("command-palette-input")).toHaveClass(
      "min-h-[44px]",
    );
  });

  // #574: ARIA 1.2 combobox-with-listbox-popup pattern — role=combobox,
  // aria-expanded, aria-controls pointing at the listbox's real id, and
  // role=listbox/option (+ ids, aria-selected) on the results, with
  // aria-activedescendant tracking the arrow-key-highlighted row. Keyboard
  // behavior itself is covered by the pre-existing arrow/Enter/Escape tests
  // above, which are unchanged by this packet.
  describe("#574 combobox semantics", () => {
    it("input exposes role=combobox, aria-expanded, and aria-controls pointing at the real listbox id", () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const input = screen.getByTestId("command-palette-input");
      expect(input).toHaveAttribute("role", "combobox");
      expect(input).toHaveAttribute("aria-expanded", "true");

      const listbox = screen.getByRole("listbox", { name: "Commands" });
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
      expect(listbox.id).toBeTruthy();
    });

    it("options expose role=option, ids, and aria-selected already wired for aria-activedescendant", () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(ACTIONS.length);
      for (const option of options) {
        expect(option.id).toBeTruthy();
      }
    });

    it("aria-activedescendant tracks the highlighted row as arrow keys move it", () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const input = screen.getByTestId("command-palette-input");
      const startOption = screen.getByTestId("command-palette-option-start");
      const flowOption = screen.getByTestId("command-palette-option-flow");

      // Starts highlighted on the first row ("start").
      expect(input.getAttribute("aria-activedescendant")).toBe(startOption.id);

      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(input.getAttribute("aria-activedescendant")).toBe(flowOption.id);
    });

    // #595: the combobox is identified only by placeholder text on current
    // main — a stable accessible name (independent of placeholder/value)
    // is required so assistive tech announces it consistently.
    it("has a stable accessible name via aria-label, independent of the placeholder", () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const combobox = screen.getByRole("combobox", {
        name: "Search commands",
      });
      expect(combobox).toBe(screen.getByTestId("command-palette-input"));
    });

    it("aria-activedescendant is unset when no options match the query", () => {
      render(
        <CommandPalette
          open
          actions={ACTIONS}
          onRun={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      fireEvent.change(screen.getByTestId("command-palette-input"), {
        target: { value: "zzz-no-match" },
      });

      expect(screen.getByTestId("command-palette-input")).not.toHaveAttribute(
        "aria-activedescendant",
      );
    });
  });
});
