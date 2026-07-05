"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AreaHealthDots } from "./AreaHealthDots";
import type { AreaHealthVM, WaitingVM } from "./momentsViewModel";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Two stacked cards: "Waiting on" and "Areas". Empty states are truthful
 * and calm — no shame language, just what's actually true right now.
 */

export interface SideRailProps {
  waitingOn: WaitingVM[];
  areas: AreaHealthVM[];
  onOpenHealth(): void;
}

const WAITING_STATUS_VAR: Record<WaitingVM["status"], string> = {
  ok: "var(--state-ok)",
  watch: "var(--state-watch)",
  risk: "var(--state-risk)",
};

export function SideRail({ waitingOn, areas, onOpenHealth }: SideRailProps) {
  return (
    <div className="grid gap-4" data-testid="side-rail">
      <Card className="workflow-support-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm tracking-tight">Waiting on</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {waitingOn.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="side-rail-waiting-empty"
            >
              Nothing waiting on anyone. Mark a task as waiting during triage to
              track it here.
            </p>
          ) : (
            <ul className="grid gap-2" data-testid="side-rail-waiting-list">
              {waitingOn.map((entry) => (
                <li
                  key={entry.taskId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">{entry.title}</span>
                  <span
                    className="shrink-0 text-xs font-semibold tabular-nums"
                    style={{ color: WAITING_STATUS_VAR[entry.status] }}
                  >
                    {entry.daysWaiting}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="workflow-support-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm tracking-tight">Areas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0">
          <AreaHealthDots areas={areas} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenHealth}
            className="justify-start px-0"
            data-testid="side-rail-open-health"
          >
            View area health →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
