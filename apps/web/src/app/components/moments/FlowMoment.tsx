"use client";

import { CurrentBlockHero } from "./CurrentBlockHero";
import type { FlowVM } from "./momentsViewModel";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * The Flow moment: the current block/session hero, or a truthful empty
 * state pointing back to Start (UX-INV-6 — no dead ends). Drift recovery is
 * explicitly out of scope here; packet P4 owns rendering `vm.drift`.
 */

export interface FlowMomentSession {
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
}

export interface FlowMomentProps {
  vm: FlowVM;
  session: FlowMomentSession;
  timeDisplay: "countdown" | "clock";
  onDone(): void;
  onPause(): void;
  onExtend(minutes: number): void;
  onToggleTime(): void;
}

export function FlowMoment({
  vm,
  session,
  timeDisplay,
  onDone,
  onPause,
  onExtend,
  onToggleTime,
}: FlowMomentProps) {
  const hasActiveSession = session.activeTaskId !== null || session.total > 0;

  const heroBlock = session.activeTaskId
    ? {
        title: vm.currentBlock?.title ?? "Focus session",
        areaLabel: vm.currentBlock?.areaLabel ?? "",
      }
    : vm.currentBlock
      ? { title: vm.currentBlock.title, areaLabel: vm.currentBlock.areaLabel }
      : null;

  return (
    <div className="grid gap-6" data-testid="flow-moment">
      {heroBlock && hasActiveSession ? (
        <CurrentBlockHero
          block={heroBlock}
          remaining={session.remaining}
          total={session.total}
          running={session.running}
          timeDisplay={timeDisplay}
          onDone={onDone}
          onPause={onPause}
          onExtend={onExtend}
          onToggleTime={onToggleTime}
        />
      ) : (
        <p
          className="workflow-surface-body text-sm text-muted-foreground"
          data-testid="flow-moment-empty"
        >
          No block running — start your first move from Start.
        </p>
      )}

      {/* P4: DriftRecoveryCard slot */}
    </div>
  );
}
