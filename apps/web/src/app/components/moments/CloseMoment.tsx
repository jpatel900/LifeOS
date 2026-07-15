"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CloseVM,
  MonthOverMonthReadbackVM,
  MonthlyRollupDraftVM,
  RollupDraftVM,
} from "./momentsViewModel";
import { formatRollupCountsComparison } from "./momentsViewModel";

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
  // #486: per-area monthly rollup drafts (composed from this month's approved
  // weekly rollups), plus the monthly rollups approved this session (the
  // month-over-month readback, newest first). Same E3 provenance flags as
  // the weekly rollups, routed through the identical AI-prose choke point.
  pendingMonthlyRollups: (MonthlyRollupDraftVM & {
    enhanced?: boolean;
    hasEnhancement?: boolean;
  })[];
  approvedMonthlyRollups: {
    areaLabel: string;
    periodLabel: string;
    counts: Record<string, number>;
  }[];
  // #486: prior-month counts per area, present ONLY when a prior-month row
  // actually exists — absence must render nothing, never a fabricated "0".
  monthOverMonthReadback?: MonthOverMonthReadbackVM[];
  onApproveMonthlyRollup(draft: MonthlyRollupDraftVM): void;
  onDismissMonthlyRollup(areaId: string): void;
  onToggleMonthlyRollupProse?(areaId: string): void;
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
  pendingMonthlyRollups,
  approvedMonthlyRollups,
  monthOverMonthReadback,
  onApproveMonthlyRollup,
  onDismissMonthlyRollup,
  onToggleMonthlyRollupProse,
}: CloseMomentProps) {
  // Inline edits to a candidate's title before it is confirmed. Keyed by
  // taskId; absent means "use the candidate's original title".
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const titleFor = (win: CloseWinVM) => editedTitles[win.taskId] ?? win.title;

  return (
    <div className="grid gap-6" data-testid="close-moment">
      {/* R3-B (issue #483 round 3): R2-D correctly de-hollowed the stats
          card (952px full-bleed -> `w-fit` content-hugging) but that fix
          created a new regression — the stats card, the full-width Carry
          forward panel, and the standalone pill "Close the day" button
          then stacked as three unrelated block widths with no shared card
          boundary, on a quiet day sitting atop a large empty canvas. The
          fix here is compositional, not another width tweak: stats, carry
          forward, tomorrow's first move (when present), and the close
          action are now ONE flagship card — the closing ritual, told as a
          single deliberate arrangement, mirroring the "one hero card per
          moment" idiom Start (FirstMoveCard) and Flow (CurrentBlockHero)
          already use. The stats row itself keeps the round-2 fix (hugs its
          own content via divide-x, never stretched to the card's full
          width) — it isn't hollow anymore because the same card also
          carries real carry-forward/action content below it, not because
          the row itself got wider. Sub-section headers ("Carry forward",
          "Tomorrow's first move") use `.moments-label` — the same eyebrow
          class the sibling Wins/Weekly-rollup/Monthly-rollup CardTitles in
          this file already use — not `.workflow-page-eyebrow` (a different
          tracking/color system used elsewhere), so the merged card doesn't
          reintroduce the "two eyebrow systems in one view" defect round 2
          removed from StartMoment.

          Empty-canvas judgment (round 3 asked to choose orientation copy
          vs. a shrunk canvas): StartMoment's own empty-state card (`Quick
          capture`, state 3) is NOT gated on first-run — it renders every
          time Start has nothing queued — so "Close's empty state recurs
          daily" isn't a reason to withhold orientation copy that Start
          didn't also face. Matching that precedent: `close-moment-
          orientation` below is a brief, always-present, truthful line
          pairing the action with what it does (mirrors Start's "Press C to
          open capture" pattern) — not gated behind an "empty" check, so it
          can't drift out of sync with a real vs. quiet day. It does not by
          itself fill the ~495px of canvas still visible below this card at
          1440x900 on a fully quiet day — most of that gap is
          `MomentsThemeShell`'s shared `min-h-dvh` wrapper (documented there
          for mobile-Safari capture-pill clearance, applied identically to
          Start/Flow/Close), which sits outside this packet's file list and
          is not touched here. */}
      {pendingWins.length > 0 || confirmedWins.length > 0 ? (
        <Card className="workflow-support-card moments-card">
          <CardHeader className="pb-2">
            <CardTitle className="moments-label text-sm tracking-tight">
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
        <Card className="workflow-support-card moments-card">
          <CardHeader className="pb-2">
            <CardTitle className="moments-label text-sm tracking-tight">
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

      {pendingMonthlyRollups.length > 0 || approvedMonthlyRollups.length > 0 ? (
        <Card className="workflow-support-card moments-card">
          <CardHeader className="pb-2">
            <CardTitle className="moments-label text-sm tracking-tight">
              Monthly rollup
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0">
            {pendingMonthlyRollups.map((draft) => {
              const priorMonth = monthOverMonthReadback?.find(
                (entry) => entry.areaId === draft.areaId,
              );
              return (
                <div
                  key={draft.areaId}
                  className="grid gap-2 rounded-md border border-border/50 p-3"
                  data-testid={`close-moment-monthly-rollup-${draft.areaId}`}
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
                          data-testid={`close-moment-monthly-rollup-aiflag-${draft.areaId}`}
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
                  {priorMonth ? (
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid={`close-moment-monthly-rollup-mom-${draft.areaId}`}
                    >
                      <span className="text-foreground">Vs last month:</span>{" "}
                      {formatRollupCountsComparison(
                        draft.summary.counts,
                        priorMonth.counts,
                      )}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-1">
                    {draft.hasEnhancement && onToggleMonthlyRollupProse ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleMonthlyRollupProse(draft.areaId)}
                        className="mr-auto min-h-[44px] touch-manipulation text-xs text-muted-foreground"
                        data-testid={`close-moment-monthly-rollup-toggleprose-${draft.areaId}`}
                      >
                        {draft.enhanced ? "Keep original" : "Use AI version"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDismissMonthlyRollup(draft.areaId)}
                      className="min-h-[44px] touch-manipulation"
                      data-testid={`close-moment-monthly-rollup-dismiss-${draft.areaId}`}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => onApproveMonthlyRollup(draft)}
                      className="min-h-[44px] touch-manipulation"
                      data-testid={`close-moment-monthly-rollup-approve-${draft.areaId}`}
                    >
                      Approve rollup
                    </Button>
                  </div>
                </div>
              );
            })}

            {approvedMonthlyRollups.length > 0 ? (
              <ul
                className="grid gap-1 border-t border-border/50 pt-3"
                data-testid="close-moment-monthly-rollups-approved"
              >
                {approvedMonthlyRollups.map((rollup, index) => (
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

      <Card
        className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden border-t-4 p-0"
        style={{ borderTopColor: "var(--acc)" }}
        data-testid="close-moment-summary"
      >
        <CardContent className="grid gap-4 p-5 sm:p-6">
          <div
            className="flex w-fit items-stretch divide-x divide-border/60"
            data-testid="close-moment-stats"
          >
            <div className="flex flex-col gap-1 pr-5">
              <span
                className="text-3xl leading-none font-[650] tracking-tight tabular-nums lining-nums"
                data-testid="close-moment-completed"
              >
                {vm.completedToday}
              </span>
              <span className="moments-label">Completed today</span>
            </div>
            <div className="flex flex-col gap-1 pl-5">
              <span
                className="text-3xl leading-none font-[650] tracking-tight tabular-nums lining-nums"
                data-testid="close-moment-missed"
              >
                {vm.missedToday}
              </span>
              <span className="moments-label">Missed today</span>
            </div>
          </div>

          <div className="grid gap-2 border-t border-border/50 pt-4">
            <h3 className="moments-label m-0">Carry forward</h3>
            {vm.carryForward.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="close-moment-carry-forward-empty"
              >
                Nothing to carry forward — today&apos;s missed blocks are
                clear.
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
          </div>

          {vm.tomorrowFirstMove ? (
            <div
              className="grid gap-1 border-t border-border/50 pt-4"
              data-testid="close-moment-tomorrow-first-move"
            >
              <h3 className="moments-label m-0">
                Tomorrow&apos;s first move
              </h3>
              <p className="text-sm font-medium">
                {vm.tomorrowFirstMove.title}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {vm.tomorrowFirstMove.why} · {vm.tomorrowFirstMove.areaLabel} ·{" "}
                {vm.tomorrowFirstMove.estMinutes} min
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 border-t border-border/50 pt-4">
            <p
              className="text-xs text-muted-foreground"
              data-testid="close-moment-orientation"
            >
              Closing saves today&apos;s counts as reviewed and carries
              forward anything still open.
            </p>
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
        </CardContent>
      </Card>
    </div>
  );
}
