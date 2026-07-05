"use client";

import { CurrentBlockHero } from "./CurrentBlockHero";
import { DriftRecoveryCard } from "./DriftRecoveryCard";
import { ProgressionRail } from "./ProgressionRail";
import type { FlowVM } from "./momentsViewModel";
import type { ProgressionNode } from "./progressionNodes";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 * Moments pass P4 — packet: adds DriftRecoveryCard + ProgressionRail v0.
 *
 * The Flow moment: the current block/session hero, or a truthful empty
 * state pointing back to Start (UX-INV-6 — no dead ends). When `vm.drift`
 * is present, the recovery card renders regardless of hero/empty state
 * (UX-INV-3 — a derailed Flow is never a dead end). The progression rail
 * renders below, showing v0's presentation-only progress derivation.
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
  onReclaimDrift(): void;
  onAbandonDrift(): void;
  progressionNodes: ProgressionNode[];
}

export function FlowMoment({
  vm,
  session,
  timeDisplay,
  onDone,
  onPause,
  onExtend,
  onToggleTime,
  onReclaimDrift,
  onAbandonDrift,
  progressionNodes,
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

      {vm.drift ? (
        <DriftRecoveryCard
          drift={vm.drift}
          onReclaim={onReclaimDrift}
          onAbandon={onAbandonDrift}
        />
      ) : null}

      <ProgressionRail nodes={progressionNodes} />
    </div>
  );
}
