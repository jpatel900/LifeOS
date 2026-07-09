"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CloseVM, RollupDraftVM } from "./momentsViewModel";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * The Close moment: a summary band, the wins-harvest step (S7 #259), the
 * carry-forward list, tomorrow's first move (read-only), and the single
 * primary "Close the day" action. DayCloseSummary stays inline in this packet.
 */

export interface CloseWinVM {
  taskId: string;
  title: string;
  areaLabel: string;
}

export interface CloseMomentProps {
  vm: CloseVM;
  // S7: candidate wins still awaiting a confirm/skip decision, and the wins
  // already confirmed into the evidence log this session (reading section).
  pendingWins: CloseWinVM[];
  confirmedWins: { title: string; areaLabel: string }[];
  // S8: per-area weekly rollup drafts awaiting approve/dismiss, plus the rollups
  // approved this session (the week-over-week readback, newest first). E3
  // provenance flags are display-only: `enhanced` = the shown summary is
  // AI-reworded; `hasEnhancement` = an AI alternative exists (toggle available).
  pendingRollups: (RollupDraftVM & {
    enhanced?: boolean;
    hasEnhancement?: boolean;
  })[];
  approvedRollups: {
    areaLabel: string;
    periodLabel: string;
    counts: Record<string, number>;
  }[];
  onCloseDay(): void;
  onCarryForward(taskId: string): void;
  onConfirmWin(taskId: string, title: string): void;
  onSkipWin(taskId: string): void;
  onApproveRollup(draft: RollupDraftVM): void;
  onDismissRollup(areaId: string): void;
  // E3: swap a rollup between its AI-polished prose and the deterministic
  // original (session-local). Optional — mock/preview may omit it.
  onToggleRollupProse?(areaId: string): void;
}

export function CloseMoment({
  vm,
  pendingWins,
  confirmedWins,
  pendingRollups,
  approvedRollups,
  onCloseDay,
  onCarryForward,
  onConfirmWin,
  onSkipWin,
  onApproveRollup,
  onDismissRollup,
  onToggleRollupProse,
}: CloseMomentProps) {
  // Inline edits to a candidate's title before it is confirmed. Keyed by
  // taskId; absent means "use the candidate's original title".
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const titleFor = (win: CloseWinVM) => editedTitles[win.taskId] ?? win.title;

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

      {pendingWins.length > 0 || confirmedWins.length > 0 ? (
        <Card className="workflow-support-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm tracking-tight">
              Wins &amp; evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0">
            {pendingWins.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="close-moment-wins-empty"
              >
                Every win today is logged.
              </p>
            ) : (
              <ul
                className="grid gap-3"
                data-testid="close-moment-wins-pending"
              >
                {pendingWins.map((win) => (
                  <li
                    key={win.taskId}
                    className="grid gap-2"
                    data-testid={`close-moment-win-${win.taskId}`}
                  >
                    <Input
                      value={titleFor(win)}
                      onChange={(event) =>
                        setEditedTitles((prev) => ({
                          ...prev,
                          [win.taskId]: event.target.value,
                        }))
                      }
                      aria-label={`Win title for ${win.title}`}
                      className="text-sm"
                      data-testid={`close-moment-win-title-${win.taskId}`}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {win.areaLabel}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onSkipWin(win.taskId)}
                          className="min-h-[44px] touch-manipulation"
                          data-testid={`close-moment-win-skip-${win.taskId}`}
                        >
                          Skip
                        </Button>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={() =>
                            onConfirmWin(win.taskId, titleFor(win).trim())
                          }
                          disabled={titleFor(win).trim().length === 0}
                          className="min-h-[44px] touch-manipulation"
                          data-testid={`close-moment-win-confirm-${win.taskId}`}
                        >
                          Log win
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {confirmedWins.length > 0 ? (
              <ul
                className="grid gap-1 border-t border-border/50 pt-3"
                data-testid="close-moment-wins-confirmed"
              >
                {confirmedWins.map((win, index) => (
                  <li
                    key={`${win.title}-${index}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span aria-hidden className="text-emerald-500">
                      ✓
                    </span>
                    <span className="min-w-0 truncate">{win.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {win.areaLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {pendingRollups.length > 0 || approvedRollups.length > 0 ? (
        <Card className="workflow-support-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm tracking-tight">
              Weekly rollup
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0">
            {pendingRollups.map((draft) => (
              <div
                key={draft.areaId}
                className="grid gap-2 rounded-md border border-border/50 p-3"
                data-testid={`close-moment-rollup-${draft.areaId}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {draft.areaLabel}
                    </span>
                    {draft.enhanced ? (
                      <span
                        className="rounded border border-border/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                        title="Reworded by AI — approve only if it still matches what happened."
                        data-testid={`close-moment-rollup-aiflag-${draft.areaId}`}
                      >
                        AI-polished
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {draft.periodLabel}
                  </span>
                </div>
                {draft.summary.highlights.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">Highlights:</span>{" "}
                    {draft.summary.highlights.join("; ")}
                  </p>
                ) : null}
                {draft.summary.misses.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">Misses:</span>{" "}
                    {draft.summary.misses.join("; ")}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-1">
                  {draft.hasEnhancement && onToggleRollupProse ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleRollupProse(draft.areaId)}
                      className="mr-auto min-h-[44px] touch-manipulation text-xs text-muted-foreground"
                      data-testid={`close-moment-rollup-toggleprose-${draft.areaId}`}
                    >
                      {draft.enhanced ? "Keep original" : "Use AI version"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismissRollup(draft.areaId)}
                    className="min-h-[44px] touch-manipulation"
                    data-testid={`close-moment-rollup-dismiss-${draft.areaId}`}
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => onApproveRollup(draft)}
                    className="min-h-[44px] touch-manipulation"
                    data-testid={`close-moment-rollup-approve-${draft.areaId}`}
                  >
                    Approve rollup
                  </Button>
                </div>
              </div>
            ))}

            {approvedRollups.length > 0 ? (
              <ul
                className="grid gap-1 border-t border-border/50 pt-3"
                data-testid="close-moment-rollups-approved"
              >
                {approvedRollups.map((rollup, index) => (
                  <li
                    key={`${rollup.areaLabel}-${rollup.periodLabel}-${index}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span aria-hidden className="text-emerald-500">
                      ✓
                    </span>
                    <span className="min-w-0 truncate">{rollup.areaLabel}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {rollup.periodLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
