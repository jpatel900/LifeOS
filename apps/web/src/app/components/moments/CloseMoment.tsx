"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CloseVM } from "./momentsViewModel";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * The Close moment: a summary band, the carry-forward list, tomorrow's
 * first move (read-only), and the single primary "Close the day" action.
 * DayCloseSummary stays inline in this packet (no separate file).
 */

export interface CloseMomentProps {
  vm: CloseVM;
  onCloseDay(): void;
  onCarryForward(taskId: string): void;
}

export function CloseMoment({
  vm,
  onCloseDay,
  onCarryForward,
}: CloseMomentProps) {
  return (
    <div className="grid gap-6" data-testid="close-moment">
      <Card className="workflow-support-card">
        <CardContent className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-2">
          <div className="grid gap-0.5">
            <span
              className="text-2xl font-semibold tabular-nums"
              data-testid="close-moment-completed"
            >
              {vm.completedToday}
            </span>
            <span className="text-xs text-muted-foreground">
              Completed today
            </span>
          </div>
          <div className="grid gap-0.5">
            <span
              className="text-2xl font-semibold tabular-nums"
              data-testid="close-moment-missed"
            >
              {vm.missedToday}
            </span>
            <span className="text-xs text-muted-foreground">Missed today</span>
          </div>
        </CardContent>
      </Card>

      <Card className="workflow-support-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm tracking-tight">
            Carry forward
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {vm.carryForward.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="close-moment-carry-forward-empty"
            >
              Nothing to carry forward — today&apos;s missed blocks are clear.
            </p>
          ) : (
            <ul
              className="grid gap-2"
              data-testid="close-moment-carry-forward-list"
            >
              {vm.carryForward.map((entry) => (
                <li
                  key={entry.taskId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">{entry.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onCarryForward(entry.taskId)}
                    className="min-h-[44px] touch-manipulation"
                    data-testid={`close-moment-carry-forward-${entry.taskId}`}
                  >
                    Carry forward
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {vm.tomorrowFirstMove ? (
        <Card className="workflow-support-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm tracking-tight">
              Tomorrow&apos;s first move
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 pt-0">
            <p className="text-sm font-medium">{vm.tomorrowFirstMove.title}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {vm.tomorrowFirstMove.why} · {vm.tomorrowFirstMove.areaLabel} ·{" "}
              {vm.tomorrowFirstMove.estMinutes} min
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Button
          type="button"
          variant="default"
          onClick={onCloseDay}
          className="min-h-[44px] touch-manipulation gap-2"
          data-testid="close-moment-close-day"
        >
          Close the day
          <kbd className="rounded border border-border/60 bg-black/10 px-1.5 py-0.5 text-[0.7rem] font-semibold">
            ↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}
