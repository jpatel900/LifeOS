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
 *
 * D-4 (design alignment, #483): restyles both cards to prototype-2's rail
 * row treatment — hairline-divided rows instead of a bare list/chip-wrap,
 * plus a length-encoded age bar on each waiting-on row (bucket-derived
 * width, same idea as the prototype's `.wait .age .bar`, using
 * `waitingOnAgingBucket`'s existing ok/watch/risk buckets — not a new,
 * fabricated per-day scale). Two prototype elements are deliberately NOT
 * ported, per the packet's truthful-data rule: the avatar-initial circle
 * and the "name / context line" split. Both read off a person entity
 * (name, a per-person avatar color) that has no source here — `WaitingVM`
 * carries only a task title (see momentsViewModel.ts; `WorkflowState` has
 * no `people` store), so porting the avatar would mean inventing a name
 * and a color per row. The row keeps the task title as its single line
 * instead.
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

/**
 * D-4 (#483): bucket -> age-bar fill width, porting the prototype's
 * fresh/warn/late bar lengths (20/55/92%). This encodes the same
 * ok/watch/risk bucket the color already encodes — a second, redundant
 * read of real data (SP-3/accessibility precedent elsewhere in this file:
 * color is never the only signal) — not a fabricated per-day percentage.
 */
const WAITING_AGE_BAR_WIDTH: Record<WaitingVM["status"], string> = {
  ok: "20%",
  watch: "55%",
  risk: "92%",
};

export function SideRail({ waitingOn, areas, onOpenHealth }: SideRailProps) {
  return (
    <div className="grid gap-4" data-testid="side-rail">
      <Card className="workflow-support-card moments-card">
        <CardHeader className="pb-2">
          <CardTitle className="moments-label text-sm tracking-tight">
            Waiting on
          </CardTitle>
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
            <ul
              className="divide-y divide-border/60"
              data-testid="side-rail-waiting-list"
            >
              {waitingOn.map((entry) => (
                <li
                  key={entry.taskId}
                  className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
                  data-testid={`side-rail-waiting-row-${entry.taskId}`}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: WAITING_STATUS_VAR[entry.status] }}
                    >
                      {entry.daysWaiting}d
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1 w-11 overflow-hidden rounded-full bg-muted"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          background: WAITING_STATUS_VAR[entry.status],
                          width: WAITING_AGE_BAR_WIDTH[entry.status],
                        }}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card
        className="workflow-support-card moments-card"
        data-testid="side-rail-areas-card"
      >
        <CardHeader className="pb-2">
          <CardTitle className="moments-label text-sm tracking-tight">
            Areas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0">
          <AreaHealthDots areas={areas} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenHealth}
            className="min-h-[44px] touch-manipulation justify-start px-0"
            data-testid="side-rail-open-health"
          >
            View area health →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
