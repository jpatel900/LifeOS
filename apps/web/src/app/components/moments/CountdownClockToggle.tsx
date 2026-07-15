"use client";

import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Two-segment control switching the schedule's time column between
 * relative countdown labels and wall-clock time.
 *
 * D-10 R2 (#483 round 2, "accent discipline" — the round-1 critics' single
 * clearest "would not ship in Linear" call): this control used to paint its
 * selected segment with the identical full-saturation `--primary` fill as
 * MomentSwitcher's Start/Flow/Close tabs, ~500px away in the same masthead
 * row. A display-FORMAT preference (countdown vs. clock labels) carrying
 * the same visual weight as the primary moment nav means the accent stops
 * ranking anything. The selected segment is now a neutral raised chip
 * (bg-background + hairline shadow, the same "pressed nub on a track"
 * idiom AreaSelector's bg-muted/40 trigger already uses) — MomentSwitcher
 * is left as the ONLY accent-filled control in the masthead.
 *
 * Track sizing also drops `.workflow-shell__nav` for the same reason
 * MomentSwitcher.tsx does — see that file's comment; the unlayered
 * `padding: 0.35rem` it carries was inflating this pill to ~57px against
 * the rest of the masthead's 44px-locked controls.
 */

export type CountdownClockValue = "countdown" | "clock";

export interface CountdownClockToggleProps {
  value: CountdownClockValue;
  onChange(value: CountdownClockValue): void;
}

const SEGMENTS: { value: CountdownClockValue; label: string }[] = [
  { value: "countdown", label: "Countdown" },
  { value: "clock", label: "Clock" },
];

export function CountdownClockToggle({
  value,
  onChange,
}: CountdownClockToggleProps) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40"
      role="group"
      aria-label="Time display"
      data-testid="countdown-clock-toggle"
    >
      {SEGMENTS.map((segment) => {
        const active = value === segment.value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              HIT_TARGET_ROW,
              // R3-C (#483 round 3): px-3 -> px-2 (two steps) is part of the
              // masthead's Inter-reflow claw-back — see TodayMoments.tsx's
              // header comment. This is the "quietest" secondary control
              // (a display-format preference, not primary nav or context),
              // so it absorbs the largest single share of the claw-back.
              "flex items-center rounded-full px-2 py-1 text-xs font-semibold outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`countdown-clock-toggle-${segment.value}`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
