"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";
import { kbdHintClass } from "./kbdChip";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Three-tab pill switching between the Start/Flow/Close moments. Mirrors
 * useMomentKeyboard's 1/2/3 mapping (UX-INV-1) with matching kbd chips.
 *
 * #715 — ARIA TABS KEYBOARD CONTRACT
 * ----------------------------------
 * This control declared `role="tablist"`/`role="tab"` but behaved like three
 * independent buttons: all three sat in the sequential Tab order, and no
 * arrow/Home/End handling existed. A declared tab widget that does not follow
 * the tabs interaction model is worse than an undeclared one — assistive tech
 * announces "tab 2 of 3" and then the promised arrow keys do nothing.
 *
 * The model implemented here is the APG horizontal tabs pattern with
 * automatic activation (selection follows focus):
 * - roving tabIndex — the SELECTED tab is the tablist's only Tab stop
 *   (`tabIndex=0`), the other two are `-1`. Tab enters the whole control
 *   once and Tab/Shift+Tab leave it, instead of costing three stops.
 * - ArrowLeft/ArrowRight move one tab and select it, WRAPPING at both ends
 *   (#715 acceptance criterion 2 — Right from Close lands on Start).
 * - Home selects Start, End selects Close.
 * - focus and selection move together, so an AT user hears the new moment
 *   named as they arrive on it (automatic activation is the correct choice
 *   here: switching moments is instant client-side state, not an expensive
 *   or destructive load).
 *
 * ArrowUp/ArrowDown are deliberately NOT claimed: this tablist is horizontal
 * (`aria-orientation="horizontal"`), so per APG the vertical arrows stay with
 * the page and keep scrolling.
 *
 * WHY the current index is read from `document.activeElement` first, and only
 * falls back to `value`: TodayMoments renders the header instance and
 * BottomNavigator renders a second one (`idPrefix="bottom-nav"`) — BOTH are
 * mounted in the DOM at every viewport, with CSS hiding whichever one does
 * not belong to the current breakpoint. Anchoring the arrow step to the
 * focused element keeps each instance's keyboard math local to itself, and
 * self-corrects the one case where focus and `value` can legitimately
 * disagree: `value` changing from outside the switcher (a route change, or
 * another control) while a tab still holds focus. It also means this file
 * needs no focus-syncing effect — an effect would fire in BOTH instances and
 * try to focus a `display:none` button, dropping focus to `<body>`.
 *
 * NOT added here, on purpose: `aria-controls`. There is no `role="tabpanel"`
 * anywhere in `apps/web/src` — the moment surfaces are whole page bodies, not
 * panels this pill owns. Pointing `aria-controls` at an id that does not
 * exist is an `aria-valid-attr-value` failure, i.e. it would ADD real WCAG
 * violations (and push up a11y-axe-pin.spec.ts's ratchet) in exchange for
 * nothing. Introducing genuine tabpanels is a structural change #715's Scope
 * section rules out.
 *
 * D-10 R2 (#483 round 2): the track no longer uses `.workflow-shell__nav`
 * (globals.css) — that class's `padding: 0.35rem` is an *unlayered* rule,
 * which Tailwind's cascade layers always rank above the `p-1` utility this
 * track used to carry, silently inflating the rendered pill to ~57px tall
 * against the rest of the masthead's 44px controls (a visible 13px
 * cross-control height mismatch a round-1 critic measured and flagged as a
 * blocker). Zero track padding + each tab's own `min-h-[44px]` floor
 * (HIT_TARGET_ROW, unchanged) now height-locks this control to the same
 * ~44-46px line as AreaSelector/MastheadThemeToggle/the Settings link.
 */

export type MomentValue = "start" | "flow" | "close";

export interface MomentSwitcherProps {
  value: MomentValue;
  onChange(value: MomentValue): void;
  /**
   * #574: the mobile bottom navigator renders a second MomentSwitcher
   * instance alongside the header's (same `value`/`onChange` — no forked
   * state, just a second view onto it). Two instances with identical
   * `data-testid`s in the DOM at once would break every existing
   * `getByTestId("moment-switcher-*")` call (RTL throws on ambiguous
   * matches). Default omitted keeps the original testids byte-for-byte for
   * every existing single-instance call site (header, standalone tests);
   * the bottom navigator passes `idPrefix="bottom-nav"` to get distinct
   * `moment-switcher-bottom-nav*` ids instead.
   */
  idPrefix?: string;
}

const TABS: { value: MomentValue; label: string; keyHint: string }[] = [
  { value: "start", label: "Start", keyHint: momentKeyLabel("switch-start") },
  { value: "flow", label: "Flow", keyHint: momentKeyLabel("switch-flow") },
  { value: "close", label: "Close", keyHint: momentKeyLabel("switch-close") },
];

export function MomentSwitcher({
  value,
  onChange,
  idPrefix,
}: MomentSwitcherProps) {
  const testIdBase = idPrefix
    ? `moment-switcher-${idPrefix}`
    : "moment-switcher";
  const tabRefs = useRef<
    Partial<Record<MomentValue, HTMLButtonElement | null>>
  >({});

  /**
   * Where the arrow step counts from: the tab that actually holds focus,
   * falling back to the selected one (keyboard use always focuses a tab
   * first, so the fallback only covers a synthetic event fired at the
   * tablist itself). See the file header for why focus, not `value`, is the
   * primary anchor.
   */
  function currentIndex(): number {
    const active =
      typeof document === "undefined" ? null : document.activeElement;
    const focused = TABS.findIndex(
      (tab) => tabRefs.current[tab.value] === active,
    );
    if (focused !== -1) return focused;
    const selected = TABS.findIndex((tab) => tab.value === value);
    return selected === -1 ? 0 : selected;
  }

  /** Selection follows focus: select the tab, then land focus on it. */
  function moveTo(index: number): void {
    const target = TABS[index];
    if (!target) return;
    onChange(target.value);
    tabRefs.current[target.value]?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    // A held modifier means the combo belongs to something else (the
    // Cmd/Ctrl+K palette, browser history, OS text navigation) — never ours.
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const last = TABS.length - 1;
    const from = currentIndex();
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = from === last ? 0 : from + 1;
        break;
      case "ArrowLeft":
        next = from === 0 ? last : from - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        // Everything else — including 1/2/3, Tab, and the vertical arrows —
        // passes straight through untouched.
        return;
    }
    // Only reached for the four keys above: stops Home/End scrolling the
    // page out from under the user, and ArrowLeft/Right nudging any
    // horizontally scrollable ancestor.
    event.preventDefault();
    moveTo(next);
  }

  return (
    <div
      role="tablist"
      aria-label="Moment"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40"
      data-testid={testIdBase}
    >
      {TABS.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            // Roving tabIndex (#715 AC-1): exactly one Tab stop per switcher.
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              tabRefs.current[tab.value] = node;
            }}
            onClick={() => onChange(tab.value)}
            className={cn(
              HIT_TARGET_ROW,
              // R3-C (#483 round 3): px-3 -> px-2.5 is a small share of the
              // masthead's Inter-reflow claw-back — see TodayMoments.tsx's
              // header comment. MomentSwitcher stays the visually dominant
              // control (only accent fill, still the widest by a wide
              // margin) — this is a padding harmonization, not a demotion.
              "group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`${testIdBase}-${tab.value}`}
          >
            {tab.label}
            <kbd className={kbdHintClass(selected)}>{tab.keyHint}</kbd>
          </button>
        );
      })}
    </div>
  );
}
