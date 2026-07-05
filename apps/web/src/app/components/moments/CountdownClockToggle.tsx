"use client";

import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Two-segment control switching the schedule's time column between
 * relative countdown labels and wall-clock time.
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
      className="workflow-shell__nav inline-flex items-center gap-1 border border-border bg-muted/40 p-1"
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
              "flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0",
              active
                ? "bg-primary text-primary-foreground"
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
