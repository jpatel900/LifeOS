"use client";

import { cn } from "@/lib/utils";
import { formatRemaining, formatUntil } from "./useCountdown";
import type { ScheduleBlockVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Single schedule row. All time derivation comes from props (`now`,
 * `block.startAt`/`endAt`) — never Date.now() — so the row is deterministic
 * and screenshot/test-stable.
 */

export type ScheduleTimeDisplay = "countdown" | "clock";

export interface ScheduleBlockProps {
  block: ScheduleBlockVM;
  timeDisplay: ScheduleTimeDisplay;
  now: Date;
}

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeColumnLabel(
  block: ScheduleBlockVM,
  timeDisplay: ScheduleTimeDisplay,
  now: Date,
): string {
  if (timeDisplay === "clock") {
    return clockLabel(block.startAt);
  }

  if (block.state === "now" && block.endAt) {
    return formatRemaining(new Date(block.endAt).getTime() - now.getTime());
  }

  if (block.state === "upcoming") {
    return formatUntil(new Date(block.startAt).getTime() - now.getTime());
  }

  return clockLabel(block.startAt);
}

export function ScheduleBlock({ block, timeDisplay, now }: ScheduleBlockProps) {
  const isDone = block.state === "done";
  const isNow = block.state === "now";
  const isFree = block.state === "free";

  return (
    <li
      className={cn(
        "workflow-compact-item flex items-center justify-between gap-3",
        isNow && "area-accent-card",
        isDone && "opacity-60",
      )}
      data-testid="schedule-block"
      data-state={block.state}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm font-medium",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {block.title}
        </span>
        {block.meta ? (
          <span className="text-xs text-muted-foreground">{block.meta}</span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isFree ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              background:
                "var(--grn-sf, color-mix(in oklch, var(--state-ok) 18%, transparent))",
              color: "var(--state-ok)",
            }}
            data-testid="schedule-block-pill"
          >
            Free
          </span>
        ) : isNow ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
            style={{
              background: "color-mix(in oklch, var(--acc) 18%, transparent)",
              color: "var(--acc)",
            }}
            data-testid="schedule-block-pill"
          >
            {timeColumnLabel(block, timeDisplay, now)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {timeColumnLabel(block, timeDisplay, now)}
          </span>
        )}
      </div>
    </li>
  );
}
