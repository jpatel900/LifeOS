"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CurrentBlockHero } from "./CurrentBlockHero";
import { DriftRecoveryCard } from "./DriftRecoveryCard";
import { FirstTinyStepCard } from "./FirstTinyStepCard";
import { FlowIdleOrientation } from "./FlowIdleOrientation";
import {
  TaskMapSection,
  type TaskMapDraftUiState,
  type TaskMapFocusedTask,
} from "./TaskMapSection";
import type { FlowVM } from "./momentsViewModel";
import type { ProgressionNode } from "./progressionNodes";
import type { TaskMapGraph } from "@/lib/taskmap/graph";
import { momentKeyLabel } from "@/lib/keys/keymap";

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
 *
 * R3-B (premium push #483, round 3): the no-active-block state used to be
 * a bare muted text line with zero card/border treatment, floating on an
 * otherwise empty page. It now uses the exact same card shell as
 * CurrentBlockHero (`workflow-flagship-card moments-card
 * moments-card--emphasis`, accent top border) so the empty and populated
 * states read as the same hero slot — one composed, the other quiet —
 * rather than a composed hero replaced by nothing at all. Copy stays
 * factual (no block exists, here is the one real way to start one); no
 * block or session detail is fabricated.
 *
 * R4-B (premium push #483, round 4): R3-B fixed the card; the page around
 * it was still unfinished — on a fully quiet day (no drift, no first-move
 * task) nothing rendered below that one small card, leaving ~543px of void
 * at 1440x900. `FlowIdleOrientation` (see its doc comment) fills that with
 * evergreen, data-free "what Flow is" content whenever there's no active
 * session — the same "fill with orientation content" ruling the owner
 * already applied to Start's empty day.
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
  onApproveTaskMapDraft(
    graph: TaskMapGraph & { schema_version: "1.0" | "1.1" },
  ): void;
  onToggleTaskMapNodeCompletion(nodeId: string): void;
  /** #572: the active task's committed opening move, or null when unset. */
  firstTinyStep: string | null;
  onUpdateFirstTinyStep(value: string): void;
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
  firstTinyStep,
  onUpdateFirstTinyStep,
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
        <Card
          className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden border-t-4 p-0"
          style={{ borderTopColor: "var(--acc)" }}
          data-testid="flow-moment-empty"
        >
          <CardContent className="grid gap-3 p-5 sm:p-6">
            <h2 className="workflow-surface-title moments-card-title">
              No block running
            </h2>
            <p className="workflow-surface-body text-sm text-muted-foreground">
              Start your first move from Start —{" "}
              <kbd className="rounded border border-border/60 bg-black/5 px-1 text-[0.7rem] font-semibold">
                {momentKeyLabel("switch-start")}
              </kbd>{" "}
              switches moments.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasActiveSession ? <FlowIdleOrientation /> : null}

      {hasActiveSession ? (
        <FirstTinyStepCard
          value={firstTinyStep}
          onSave={onUpdateFirstTinyStep}
        />
      ) : null}

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
