import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { KeyboardLegend } from "./KeyboardLegend";

// The legend curates a subset of MOMENT_KEY_BINDINGS (see DISPLAYED_ACTION_IDS
// in KeyboardLegend.tsx) — the shortcuts a first-time user wouldn't otherwise
// guess. Enter/Escape are deliberately left off (standard UI conventions,
// and the width headroom next to the wide capture pill is tight at desktop
// widths — see the moments-home-parity e2e guard).
const DISPLAYED_IDS = [
  "switch-start",
  "switch-flow",
  "switch-close",
  "open-capture",
  "open-command-palette",
] as const;

describe("KeyboardLegend", () => {
  it("renders as a non-interactive group, not announced as actionable", () => {
    render(<KeyboardLegend />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).toHaveAttribute("role", "group");
    expect(legend).toHaveAttribute("aria-label", "Keyboard shortcuts");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders each displayed shortcut's key glyph straight from the keymap (single source of truth)", () => {
    render(<KeyboardLegend />);
    const legend = screen.getByTestId("keyboard-legend");

    for (const id of DISPLAYED_IDS) {
      const glyph = momentKeyLabel(id);
      expect(
        Array.from(legend.querySelectorAll("kbd")).some(
          (kbd) => kbd.textContent === glyph,
        ),
        `expected a <kbd> for "${id}" showing "${glyph}"`,
      ).toBe(true);
    }
  });

  // Deliberately excluded to keep width in check next to the wide capture
  // pill (owner density feedback, #483) — see KeyboardLegend.tsx comment.
  it("does not surface the primary-action or escape bindings", () => {
    render(<KeyboardLegend />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).not.toHaveTextContent(momentKeyLabel("escape"));
    expect(legend).not.toHaveTextContent(momentKeyLabel("primary-action"));
    expect(legend).not.toHaveTextContent("primary");
  });

  it("is hidden below the sm breakpoint so it never crowds the capture pill", () => {
    render(<KeyboardLegend />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).toHaveClass("hidden");
    expect(legend).toHaveClass("sm:flex");
  });

  it("does not intercept pointer events (display-only)", () => {
    render(<KeyboardLegend />);
    expect(screen.getByTestId("keyboard-legend")).toHaveClass(
      "pointer-events-none",
    );
  });
});
