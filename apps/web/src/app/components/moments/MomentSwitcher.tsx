"use client";

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
  return (
    <div
      role="tablist"
      aria-label="Moment"
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
