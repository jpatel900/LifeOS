"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FirstMoveCard, type FirstMoveCardMove } from "./FirstMoveCard";
import { ScheduleList } from "./ScheduleList";
import { SideRail } from "./SideRail";
import { PipelineOverview } from "./PipelineOverview";
import { FocusList } from "./FocusList";
import type { FirstMoveVM, StartVM } from "./momentsViewModel";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * The Start moment: first move, today's schedule, and the waiting-on/area
 * health side rail. Layout mirrors the P2 preview grid (main column + a
 * fixed-width rail). UX-INV-6: the empty state is truthful — no first move
 * queued is stated plainly, with the capture shortcut as the way out.
 *
 * Moments pass P5 adds a collapsed-by-default "Pipeline" `<details>`
 * disclosure at the bottom (NFR-005): PipelineOverview renders inside it,
 * never in the masthead and never a seventh nav item.
 *
 * S5 (#257) adds the calendar-load-aware focus budget: FirstMoveCard
 * remains the #1 focus item (it always renders `vm.firstMove`, which is
 * `vm.focusItems[0]` — see momentsViewModel's `buildFocusItems`); a
 * "Today's focus" FocusList renders the remaining in-budget items
 * (`vm.focusItems.slice(1)`) plus the over-budget `vm.deferredItems` tail,
 * visibly marked "Deferred" rather than hidden. `vm.focusDegraded` shows a
 * quiet note that a fixed default budget is in use, reusing the repo's
 * existing calm degraded-state phrasing (state the fallback plainly, keep
 * working — no guilt language).
 *
 * S6 (#258) daily brief additions — both purely additive, each independently
 * absent when its signal doesn't apply (no guilt language, no dead ends):
 * a one-line "hasn't moved in N days" note for `vm.staleProject` (omitted
 * entirely when null), and a `--state-watch` (never `--state-risk`)
 * recovery-nudge card for `vm.recoveryNudge` — a plain-language surfaced
 * suggestion for a block missed yesterday. The card's single action routes
 * to the existing Close-moment carry-forward surface (`onOpenRecovery`); it
 * never mutates from here.
 *
 * D-2 (design alignment, #483) — start-moment hero: a greeting
 * (`vm.greeting`) and deterministic day-synthesis sentence
 * (`vm.daySynthesis`), porting prototype-2's "Good morning, Jay." + subline
 * ahead of the FirstMoveCard. Both are computed in momentsViewModel
 * (`buildGreeting`/`buildDaySynthesis`) — pure, no AI prose, no new fetch.
 * Presentation-only: the first-move card below already carries the target
 * "Start now / Snooze 10m / Not this" microcopy and its existing
 * launch-gate handlers (`onStartMove`/`onSnooze`/`onSwap`) are unchanged.
 */

export interface StartMomentProps {
  vm: StartVM;
  timeDisplay: "countdown" | "clock";
  now: Date;
  onStartMove(move: FirstMoveVM): void;
  onSnooze(): void;
  onSwap(): void;
  onOpenHealth(): void;
  pipelineCounts: Record<string, number>;
  onDrillPipeline(stage: string): void;
  onOpenRecovery(taskId: string): void;
}

export function StartMoment({
  vm,
  timeDisplay,
  now,
  onStartMove,
  onSnooze,
  onSwap,
  onOpenHealth,
  pipelineCounts,
  onDrillPipeline,
  onOpenRecovery,
}: StartMomentProps) {
  const cardMove: FirstMoveCardMove | null = vm.firstMove
    ? {
        title: vm.firstMove.title,
        why: vm.firstMove.why,
        areaLabel: vm.firstMove.areaLabel,
        estMinutes: vm.firstMove.estMinutes,
      }
    : null;

  const recoveryNudge = vm.recoveryNudge;

  return (
    <div className="grid gap-6" data-testid="start-moment">
      <div className="grid gap-1" data-testid="start-hero">
        <h1 className="moments-greeting" data-testid="start-greeting">
          {vm.greeting}
        </h1>
        <p className="moments-daysynthesis" data-testid="start-day-synthesis">
          {vm.daySynthesis}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          {cardMove && vm.firstMove ? (
            <FirstMoveCard
              move={cardMove}
              onStart={() => onStartMove(vm.firstMove as FirstMoveVM)}
              onSnooze={onSnooze}
              onSwap={onSwap}
            />
          ) : (
            <p
              className="workflow-surface-body text-sm text-muted-foreground"
              data-testid="start-moment-empty"
            >
              Nothing queued — capture something with{" "}
              <kbd className="rounded border border-border/60 bg-black/5 px-1 text-[0.7rem] font-semibold">
                C
              </kbd>
              .
            </p>
          )}

          {vm.focusItems.length > 1 || vm.deferredItems.length > 0 ? (
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="moments-label text-sm font-semibold text-muted-foreground">
                  Today&apos;s focus
                </h2>
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  data-testid="focus-budget-label"
                >
                  Budget: {vm.focusBudget}
                </span>
              </div>
              {vm.focusDegraded ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="focus-degraded-note"
                >
                  Calendar load is unavailable right now, so a default focus
                  budget is in use.
                </p>
              ) : null}
              <FocusList
                items={vm.focusItems.slice(1)}
                deferred={vm.deferredItems}
              />
            </section>
          ) : null}

          {recoveryNudge ? (
            <Card
              className="workflow-support-card moments-card relative overflow-hidden border-l-4 p-0"
              style={{ borderLeftColor: "var(--state-watch)" }}
              data-testid="start-recovery-nudge"
            >
              <CardContent className="grid gap-2 p-4 sm:p-5">
                <p
                  className="workflow-page-eyebrow m-0"
                  style={{ color: "var(--state-watch)" }}
                >
                  Yesterday
                </p>
                <p className="text-sm">
                  A block got missed yesterday:{" "}
                  <span className="font-medium">
                    {recoveryNudge.blockTitle}
                  </span>
                  .
                </p>
                <div className="mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenRecovery(recoveryNudge.taskId)}
                    className="min-h-[44px] touch-manipulation"
                    data-testid="start-recovery-nudge-open"
                  >
                    Review it in Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {vm.staleProject ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="start-stale-project"
            >
              Hasn&apos;t moved in {vm.staleProject.ageDays} days:{" "}
              <span className="font-medium">{vm.staleProject.name}</span>
            </p>
          ) : null}

          <section className="grid gap-3">
            <h2 className="moments-label text-sm font-semibold text-muted-foreground">
              Today&apos;s schedule
            </h2>
            <ScheduleList
              blocks={vm.blocks}
              timeDisplay={timeDisplay}
              now={now}
            />
          </section>
        </div>

        <SideRail
          waitingOn={vm.waitingOn}
          areas={vm.areas}
          onOpenHealth={onOpenHealth}
        />
      </div>

      <details
        className="workflow-support-card moments-card rounded-lg border border-border p-3"
        data-testid="start-moment-pipeline-disclosure"
      >
        <summary className="moments-label cursor-pointer text-sm font-semibold text-muted-foreground">
          Pipeline
        </summary>
        <div className="mt-3">
          <PipelineOverview counts={pipelineCounts} onDrill={onDrillPipeline} />
        </div>
      </details>
    </div>
  );
}
