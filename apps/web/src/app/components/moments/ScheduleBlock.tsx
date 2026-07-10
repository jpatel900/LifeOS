"use client";

import { cn } from "@/lib/utils";
import { formatRemaining, formatUntil } from "./useCountdown";
import { formatClock } from "./formatTime";
import type { ScheduleBlockVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Single schedule row. All time derivation comes from props (`now`,
 * `block.startAt`/`endAt`) — never Date.now() — so the row is deterministic
 * and screenshot/test-stable.
 *
 * D-5 (design alignment, #483) — "Ahead of you" row treatment, ported from
 * prototype-2's `.block`/`.block.now`/`.block.done` states, restyled per
 * owner feedback (#483, 2026-07-10: "too many things going") to the minimum
 * that carries real state:
 *  - a left status dot per `block.state` (done = accent outline ring, now =
 *    filled accent, upcoming/free = neutral outline) — the prototype's
 *    "shape" column, using
 *    only existing `--acc`/`--border` tokens, no new CSS class or
 *    animation (the prototype's pulsing dot is a new keyframe/duration the
 *    motion budget guard (G-UX-4) forbids adding);
 *  - the "now" row gets `data-accent-strength="strong"` — the stronger
 *    gradient+shadow `.area-accent-card` variant already defined in
 *    globals.css for the flagship cards, applied here for the first time to
 *    read as the prototype's "protected block" emphasis without any new
 *    CSS;
 *  - `aria-current="true"` on the now row and an sr-only "Completed"/"Now"
 *    prefix on done/now rows — screen readers currently get zero signal for
 *    a state that's fully conveyed by strikethrough/tint today.
 * Deliberately NOT ported: the prototype's "your protected focus window"
 * subtitle and the countdown-vs-clock toggle hint text both describe policy
 * concepts (what's protected, why) with no backing field on `ScheduleBlockVM`
 * — inventing them would be decoration without real data, which the packet
 * explicitly rules out.
 */

export type ScheduleTimeDisplay = "countdown" | "clock";

export interface ScheduleBlockProps {
  block: ScheduleBlockVM;
  timeDisplay: ScheduleTimeDisplay;
  now: Date;
}

function timeColumnLabel(
  block: ScheduleBlockVM,
  timeDisplay: ScheduleTimeDisplay,
  now: Date,
): string {
  if (timeDisplay === "clock") {
    return formatClock(block.startAt);
  }

  if (block.state === "now" && block.endAt) {
    return formatRemaining(new Date(block.endAt).getTime() - now.getTime());
  }

  if (block.state === "upcoming") {
    return formatUntil(new Date(block.startAt).getTime() - now.getTime());
  }

  return formatClock(block.startAt);
}

/**
 * Left status dot — the prototype's "shape" column ported without its
 * pulse animation (motion budget guard, G-UX-4). Carries the same state
 * `block.state` already renders via strikethrough/tint/pill; `aria-hidden`
 * because the sr-only prefix below is the accessible copy of this signal.
 */
function StatusDot({ state }: { state: ScheduleBlockVM["state"] }) {
  if (state === "now") {
    return (
      <span
        aria-hidden="true"
        data-testid="schedule-block-dot"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: "var(--acc)" }}
      />
    );
  }

  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        data-testid="schedule-block-dot"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ border: "1.5px solid var(--acc)" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      data-testid="schedule-block-dot"
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full border",
        state === "free" && "border-dashed",
      )}
      style={{ borderColor: "var(--border)" }}
    />
  );
}

const STATE_SR_PREFIX: Partial<Record<ScheduleBlockVM["state"], string>> = {
  done: "Completed: ",
  now: "Now: ",
};

export function ScheduleBlock({ block, timeDisplay, now }: ScheduleBlockProps) {
  const isDone = block.state === "done";
  const isNow = block.state === "now";
  const isFree = block.state === "free";
  const srPrefix = STATE_SR_PREFIX[block.state];

  return (
    <li
      className={cn(
        "workflow-compact-item moments-row flex items-center gap-3",
        isNow && "area-accent-card",
        isDone && "opacity-60",
      )}
      data-testid="schedule-block"
      data-state={block.state}
      data-accent-strength={isNow ? "strong" : undefined}
      aria-current={isNow ? "true" : undefined}
    >
      <StatusDot state={block.state} />

      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
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
      </div>
    </li>
  );
}
