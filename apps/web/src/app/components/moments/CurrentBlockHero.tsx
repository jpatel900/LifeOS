"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock } from "./formatTime";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * Flow moment's hero: the single active/current block. UX-INV-1: exactly one
 * visually-primary action ("Done — log it"); "Pause"/"Resume" and "+25 min"
 * are ghost/subordinate actions. The countdown is framed as "a budget, not a
 * clock" (UX-INV-4) and switches to the warn color once remaining time
 * crosses the shared 10-minute threshold used by useCountdown.
 */

export const CURRENT_BLOCK_WARN_THRESHOLD_SECONDS = 10 * 60;

export interface CurrentBlockHeroBlock {
  title: string;
  areaLabel: string;
}

export interface CurrentBlockHeroProps {
  block: CurrentBlockHeroBlock;
  /** Remaining seconds in the current block/session. */
  remaining: number;
  /** Total seconds budgeted for the current block/session. */
  total: number;
  running: boolean;
  timeDisplay: "countdown" | "clock";
  onDone(): void;
  onPause(): void;
  onExtend(minutes: number): void;
  onToggleTime(): void;
}

/** Formats whole seconds as mm:ss, floored at 0. */
export function formatMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clockEndLabel(remainingSeconds: number): string {
  const end = new Date(Date.now() + Math.max(0, remainingSeconds) * 1000);
  return formatClock(end.toISOString());
}

export function CurrentBlockHero({
  block,
  remaining,
  total,
  running,
  timeDisplay,
  onDone,
  onPause,
  onExtend,
  onToggleTime,
}: CurrentBlockHeroProps) {
  const warn = remaining <= CURRENT_BLOCK_WARN_THRESHOLD_SECONDS;

  return (
    <Card
      className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden border-t-4 p-0"
      style={{ borderTopColor: "var(--acc)" }}
      data-testid="current-block-hero"
    >
      <CardContent className="grid gap-3 p-5 sm:p-6">
        <p className="workflow-page-eyebrow m-0">
          Current block · deep work · {block.areaLabel}
        </p>
        <h2 className="workflow-surface-title moments-card-title">
          {block.title}
        </h2>

        <div className="mt-1 flex flex-wrap items-end gap-2">
          {timeDisplay === "clock" ? (
            <button
              type="button"
              onClick={onToggleTime}
              className={cn(
                HIT_TARGET_ROW,
                "flex items-center text-3xl font-semibold tabular-nums tracking-tight",
              )}
              data-testid="current-block-hero-time"
            >
              until {clockEndLabel(remaining)}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleTime}
              className={cn(
                HIT_TARGET_ROW,
                "flex items-center text-3xl font-semibold tabular-nums tracking-tight",
                warn && "text-[color:var(--state-warn)]",
              )}
              data-testid="current-block-hero-time"
            >
              {formatMmSs(remaining)}
            </button>
          )}
          <span className="pb-1 text-xs text-muted-foreground">
            remaining — a budget, not a clock
          </span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.max(0, Math.min(total, remaining))}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0}%`,
              background: warn ? "var(--state-warn)" : "var(--acc)",
            }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            onClick={onDone}
            className="min-h-[44px] touch-manipulation gap-2"
            data-testid="current-block-hero-done"
          >
            Done — log it
            <kbd className="rounded border border-border/60 bg-black/10 px-1.5 py-0.5 text-[0.7rem] font-semibold">
              ↵
            </kbd>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPause}
            className="min-h-[44px] touch-manipulation"
            data-testid="current-block-hero-pause"
          >
            {running ? "Pause" : "Resume"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onExtend(25)}
            className="min-h-[44px] touch-manipulation"
            data-testid="current-block-hero-extend"
          >
            +25 min
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
