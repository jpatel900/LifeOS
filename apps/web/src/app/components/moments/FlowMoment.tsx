"use client";

import { CurrentBlockHero } from "./CurrentBlockHero";
import { DriftRecoveryCard } from "./DriftRecoveryCard";
import {
  TaskMapSection,
  type TaskMapDraftUiState,
  type TaskMapFocusedTask,
} from "./TaskMapSection";
import type { FlowVM } from "./momentsViewModel";
import type { ProgressionNode } from "./progressionNodes";
import type { TaskMapGraph } from "@/lib/taskmap/graph";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 * Moments pass P4 — packet: adds DriftRecoveryCard + ProgressionRail v0.
 * FR-031 slice 5 — packet: swaps the bare ProgressionRail for
 * `TaskMapSection`, which renders the v0 rail (unchanged) plus an
 * on-demand "Draft map" affordance when there's no approved map yet, or
 * the approved-map collapsed view when there is one.
 *
 * The Flow moment: the current block/session hero, or a truthful empty
 * state pointing back to Start (UX-INV-6 — no dead ends). When `vm.drift`
 * is present, the recovery card renders regardless of hero/empty state
 * (UX-INV-3 — a derailed Flow is never a dead end).
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
  focusedTask: TaskMapFocusedTask | null;
  taskMapDraft: TaskMapDraftUiState;
  now: Date;
  onRequestTaskMapDraft(): void;
  onDismissTaskMapDraft(): void;
  onApproveTaskMapDraft(graph: TaskMapGraph & { schema_version: "1.0" }): void;
  onToggleTaskMapNodeCompletion(nodeId: string): void;
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
  focusedTask,
  taskMapDraft,
  now,
  onRequestTaskMapDraft,
  onDismissTaskMapDraft,
  onApproveTaskMapDraft,
  onToggleTaskMapNodeCompletion,
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

      <TaskMapSection
        task={focusedTask}
        progressionNodes={progressionNodes}
        draftState={taskMapDraft}
        now={now}
        onRequestDraft={onRequestTaskMapDraft}
        onDismissDraft={onDismissTaskMapDraft}
        onApproveDraft={onApproveTaskMapDraft}
        onToggleNodeCompletion={onToggleTaskMapNodeCompletion}
      />
    </div>
  );
}
