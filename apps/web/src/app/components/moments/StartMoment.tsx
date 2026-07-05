"use client";

import { FirstMoveCard, type FirstMoveCardMove } from "./FirstMoveCard";
import { ScheduleList } from "./ScheduleList";
import { SideRail } from "./SideRail";
import { PipelineOverview } from "./PipelineOverview";
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
}: StartMomentProps) {
  const cardMove: FirstMoveCardMove | null = vm.firstMove
    ? {
        title: vm.firstMove.title,
        why: vm.firstMove.why,
        areaLabel: vm.firstMove.areaLabel,
        estMinutes: vm.firstMove.estMinutes,
      }
    : null;

  return (
    <div className="grid gap-6" data-testid="start-moment">
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

          <section className="grid gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
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
        className="workflow-support-card rounded-lg border border-border p-3"
        data-testid="start-moment-pipeline-disclosure"
      >
        <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
          Pipeline
        </summary>
        <div className="mt-3">
          <PipelineOverview counts={pipelineCounts} onDrill={onDrillPipeline} />
        </div>
      </details>
    </div>
  );
}
