import { describe, expect, it } from "vitest";
import {
  KBD_CHIP_NEUTRAL,
  KBD_CHIP_ON_ACCENT,
  KBD_HINT_REVEAL,
  kbdHintClass,
} from "./kbdChip";

/**
 * D-10 R2 (#483 round 2, blocker #6 — kbd chip inconsistency): the shared
 * kbd-chip module. Covers the two contrast variants staying genuinely
 * distinct (never collapsing into one, which would fail the "on-accent"
 * chip's contrast against MomentSwitcher's selected tab) and the
 * hover/focus-reveal wrapper being present on the per-control helper but
 * absent from the raw neutral/accent constants (KeyboardLegend uses those
 * constants directly, unwrapped, to stay permanently visible).
 */
describe("kbdChip", () => {
  it("keeps the neutral and on-accent variants visually distinct", () => {
    expect(KBD_CHIP_NEUTRAL).not.toBe(KBD_CHIP_ON_ACCENT);
    expect(KBD_CHIP_NEUTRAL).toMatch(/text-muted-foreground/);
    expect(KBD_CHIP_ON_ACCENT).toMatch(/text-primary-foreground\/90/);
  });

  it("both variants share the same size/shape (one chip system)", () => {
    for (const variant of [KBD_CHIP_NEUTRAL, KBD_CHIP_ON_ACCENT]) {
      expect(variant).toMatch(/text-\[0\.65rem\]/);
      expect(variant).toMatch(/rounded/);
      expect(variant).toMatch(/font-semibold/);
    }
  });

  it("kbdHintClass layers HINT_REVEAL onto the right contrast variant", () => {
    const neutralHint = kbdHintClass();
    const accentHint = kbdHintClass(true);

    for (const cls of KBD_HINT_REVEAL.split(" ")) {
      expect(neutralHint).toMatch(
        new RegExp(`(^|\\s)${cls.replace(/[[\]/]/g, "\\$&")}(\\s|$)`),
      );
      expect(accentHint).toMatch(
        new RegExp(`(^|\\s)${cls.replace(/[[\]/]/g, "\\$&")}(\\s|$)`),
      );
    }
    expect(neutralHint).toMatch(/text-muted-foreground/);
    expect(accentHint).toMatch(/text-primary-foreground\/90/);
  });

  it("HINT_REVEAL hides below sm and reveals only on hover/focus at sm+, with no transition (motion-budget: static opacity swap)", () => {
    expect(KBD_HINT_REVEAL).toMatch(/(^|\s)hidden(\s|$)/);
    expect(KBD_HINT_REVEAL).toMatch(/sm:inline-flex/);
    expect(KBD_HINT_REVEAL).toMatch(/sm:group-hover:opacity-100/);
    expect(KBD_HINT_REVEAL).toMatch(/sm:group-focus-within:opacity-100/);
    expect(KBD_HINT_REVEAL).not.toMatch(/transition/);
    expect(KBD_HINT_REVEAL).not.toMatch(/duration/);
  });
});
