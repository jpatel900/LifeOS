import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./typingTarget";

/**
 * #687 round-6 bug-echo: this is the one shared definition every
 * window-level keydown listener in components/moments/** must use (see
 * useMomentKeyboard.ts, AreaSelector.tsx, MastheadThemeToggle.tsx). Pinning
 * its contract directly here, once, instead of relying only on each call
 * site's own indirect coverage: INPUT/TEXTAREA/SELECT/contentEditable are
 * typing contexts; BUTTON/A and anything else are not.
 */
describe("isTypingTarget", () => {
  it("returns false for a non-HTMLElement target (e.g. window itself, or null)", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])(
    "returns true for a focused <%s>",
    (tag) => {
      const element = document.createElement(tag);
      expect(isTypingTarget(element)).toBe(true);
    },
  );

  it("returns true for a contentEditable element", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  // The bug: BUTTON/A used to be folded into this same "typing" bucket,
  // which silently killed every window-level shortcut the instant focus
  // landed on ANY control. `toBeFalsy` (not `toBe(false)`): jsdom's
  // `isContentEditable` returns `undefined` rather than `false` for a plain
  // element with no `contenteditable` attribute (real browsers always
  // return a boolean) — an environment quirk, not something this function
  // controls, since it just returns that property through.
  it.each(["BUTTON", "A", "DIV"])(
    "returns false for a <%s> — not a typing context",
    (tag) => {
      const element = document.createElement(tag);
      expect(isTypingTarget(element)).toBeFalsy();
    },
  );
});
