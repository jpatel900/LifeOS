import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const originalPlatform = Object.getOwnPropertyDescriptor(
  window.navigator,
  "platform",
);

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("KeyboardLegend", () => {
  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(window.navigator, "platform", originalPlatform);
    }
  });

  it("renders as a group with exactly one interactive affordance — the palette door — every other chip stays inert", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).toHaveAttribute("role", "group");
    expect(legend).toHaveAttribute("aria-label", "Keyboard shortcuts");
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    // C2-S12A (#687 round-6, "desktop has no pointer route to the palette"):
    // this used to assert zero buttons too. Now exactly one — the palette
    // hint — is a real button; the moments/capture chips beside it are still
    // plain inert <span>s.
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Open command palette");
  });

  it("renders each displayed shortcut's key glyph straight from the keymap (single source of truth)", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const legend = screen.getByTestId("keyboard-legend");

    for (const id of DISPLAYED_IDS) {
      // The palette glyph is platform-detected now (see the dedicated
      // describe block below) — every OTHER id's glyph still comes straight
      // from the keymap, unconditionally.
      if (id === "open-command-palette") continue;
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
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).not.toHaveTextContent(momentKeyLabel("escape"));
    expect(legend).not.toHaveTextContent(momentKeyLabel("primary-action"));
    expect(legend).not.toHaveTextContent("primary");
  });

  it("is hidden below the sm breakpoint so it never crowds the capture pill", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const legend = screen.getByTestId("keyboard-legend");
    expect(legend).toHaveClass("hidden");
    expect(legend).toHaveClass("sm:flex");
  });

  it("keeps the group itself non-interactive; only the palette button opts back into pointer events", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId("keyboard-legend")).toHaveClass(
      "pointer-events-none",
    );
    // C2-S12A: the one deliberate, tested escape hatch — every other chip
    // stays covered by the parent's pointer-events-none shield.
    expect(screen.getByTestId("keyboard-legend-palette-button")).toHaveClass(
      "pointer-events-auto",
    );
  });

  it("clicking the palette button calls onOpenPalette — the desktop pointer route the palette lacked", () => {
    const onOpenPalette = vi.fn();
    render(<KeyboardLegend onOpenPalette={onOpenPalette} />);

    fireEvent.click(screen.getByTestId("keyboard-legend-palette-button"));

    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("the palette button reaches a 44px hit target via an invisible box (HIT_TARGET_INVISIBLE), not a visible size change", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const button = screen.getByTestId("keyboard-legend-palette-button");
    expect(button).toHaveClass("min-h-[44px]");
    expect(button).toHaveClass("min-w-[44px]");
    expect(button).toHaveClass("-m-2.5");
  });

  // D-10 R2 (#483 round 2, blocker #6 — kbd chip inconsistency): round 1
  // shipped this legend's own chip at a different size (text-xs / 12px,
  // via `py-0.5` + `bg-background` + full-opacity `border-border`) than the
  // masthead's per-control hints (text-[0.65rem] / 10.4px, `bg-black/5` +
  // `border-border/60`) — three font sizes total across the page.
  // Regression: every chip here now shares kbdChip.ts's single
  // `KBD_CHIP_NEUTRAL` treatment, matching the masthead hints' size/border/
  // background exactly (this legend just never takes the hover-reveal
  // wrapper — it's the one permanent, always-visible reference).
  it("every chip shares the single kbd-chip size/border/background treatment", () => {
    render(<KeyboardLegend onOpenPalette={vi.fn()} />);
    const legend = screen.getByTestId("keyboard-legend");
    const chips = Array.from(legend.querySelectorAll("kbd"));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).toHaveClass("text-[0.65rem]");
      expect(chip).toHaveClass("border-border/60");
      expect(chip).toHaveClass("bg-black/5");
    }
  });

  // C2-S12A (#687 round-6, "legend shows the Mac glyph on Windows"): the
  // keymap's own label for this binding is the Mac-first "⌘K", but the
  // working combo on Windows/Linux is Ctrl+K (matchesMomentKeyBinding
  // already accepts metaKey || ctrlKey — keymap.ts). The legend must never
  // print a glyph that doesn't work on the platform showing it.
  describe("palette key glyph is platform-truthful", () => {
    it("shows Ctrl+K on a non-Apple platform", () => {
      setPlatform("Win32");
      render(<KeyboardLegend onOpenPalette={vi.fn()} />);
      const button = screen.getByTestId("keyboard-legend-palette-button");
      expect(button).toHaveTextContent("Ctrl+K");
      expect(button).not.toHaveTextContent("⌘K");
    });

    it("shows the keymap's ⌘K glyph on a detected Apple platform", () => {
      setPlatform("MacIntel");
      render(<KeyboardLegend onOpenPalette={vi.fn()} />);
      const button = screen.getByTestId("keyboard-legend-palette-button");
      expect(button).toHaveTextContent(momentKeyLabel("open-command-palette"));
    });
  });
});
