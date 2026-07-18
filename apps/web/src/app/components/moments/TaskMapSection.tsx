"use client";

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { validateTaskMapForPersistence } from "@/lib/taskmap/persistence";
import type { TaskMapGraph } from "@/lib/taskmap/graph";
import { ProgressionRail } from "./ProgressionRail";
import { TaskMapDraftReview } from "./TaskMapDraftReview";
import { TaskMapView } from "./TaskMapView";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";
import type { ProgressionNode } from "./progressionNodes";

/**
 * FR-031 slice 5 — presence switch for the Flow moment progression surface.
 *
 * A focused task with an approved map renders `TaskMapView` (collapsed to
 * critical path). Otherwise the v0 `ProgressionRail` renders unchanged,
 * plus a calm, on-demand "Draft map" affordance — never a nag, never
 * background generation (NFR-001/NFR-005). A pending draft renders the
 * review surface for a one-pass approve; a failed draft shows a one-line,
 * non-blaming notice and falls back to the rail (NFR-004 — never a dead
 * end).
 *
 * FR-031 slice 8 — map revision. The approved-map view gains a quiet
 * "Revise map" affordance calling the SAME `onRequestDraft` (the caller
 * auto-detects regen vs. first-time draft from the task's current
 * `map_status`, per `requestTaskMapDraftAction` in WorkflowContext). Only
 * `draftState.phase === "ready"` replaces the approved view with the draft
 * review — `pending`/`failed` keep the approved map visible so a slow or
 * failed regen never drops the owner off their current map (NFR-004): the
 * "Revising map…" label and a failure notice render alongside the intact
 * `TaskMapView` instead. This is the v1 scope boundary for revision:
 * `docs/implementation-planning/plan-task-map-contract.md` §4.3 defers the
 * node-completion / Close / blocker-triggered proposal loop to v2 — v1
 * ships explicit user-requested regeneration only, never an automatic or
 * background proposal.
 */
export type TaskMapDraftUiState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "ready"; draft: TaskMapGraph & { schema_version: "1.0" | "1.1" } }
  | { phase: "failed"; message: string };

export interface TaskMapFocusedTask {
  id: string;
  progression_map?: unknown;
  map_status?: "draft" | "approved" | "superseded" | null;
  map_approved_at?: string | null;
}

export interface TaskMapSectionProps {
  task: TaskMapFocusedTask | null;
  progressionNodes: ProgressionNode[];
  draftState: TaskMapDraftUiState;
  now: Date;
  onRequestDraft(): void;
  onDismissDraft(): void;
  onApproveDraft(graph: TaskMapGraph & { schema_version: "1.0" | "1.1" }): void;
  /** FR-031 slice 6: omit to render the approved map read-only. */
  onToggleNodeCompletion?(nodeId: string): void;
}

export function TaskMapSection({
  task,
  progressionNodes,
  draftState,
  now,
  onRequestDraft,
  onDismissDraft,
  onApproveDraft,
  onToggleNodeCompletion,
}: TaskMapSectionProps) {
  let approvedMapView: ReactElement | null = null;
  if (task && task.map_status === "approved" && task.progression_map) {
    const validated = validateTaskMapForPersistence(task.progression_map);
    if (validated.ok) {
      approvedMapView = (
        <TaskMapView
          graph={validated.graph as TaskMapGraph}
          mapApprovedAt={task.map_approved_at ?? null}
          now={now}
          onToggleNodeCompletion={onToggleNodeCompletion}
        />
      );
    }
    // Defensive fallback: a persisted map that no longer validates never
    // blocks the surface — approvedMapView stays null and the rail renders.
  }

  // Only a READY draft (initial or regen) replaces the approved view. A
  // pending or failed regen keeps the approved map on screen (see the
  // module doc above) — the "Revise map" affordance below renders its own
  // pending/failed state alongside the intact map.
  if (draftState.phase === "ready") {
    return (
      <TaskMapDraftReview
        draft={draftState.draft}
        onApprove={onApproveDraft}
        onDismiss={onDismissDraft}
        isRevision={approvedMapView !== null}
      />
    );
  }

  if (approvedMapView) {
    return (
      <div className="grid gap-2">
        {approvedMapView}
        <div className="grid gap-1.5 justify-items-start">
          <button
            type="button"
            className={cn(
              HIT_TARGET_INVISIBLE,
              "text-xs font-medium text-muted-foreground underline-offset-2 hover:underline",
            )}
            onClick={onRequestDraft}
            disabled={draftState.phase === "pending"}
            data-testid="taskmap-revise-cta"
          >
            {draftState.phase === "pending" ? "Revising map…" : "Revise map"}
          </button>
          {draftState.phase === "failed" ? (
            <p
              className="m-0 text-xs text-muted-foreground"
              data-testid="taskmap-revise-notice"
            >
              {draftState.message}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="taskmap-rail-fallback">
      <ProgressionRail nodes={progressionNodes} />
      {task ? (
        <div className="grid gap-1.5 justify-items-start">
          <button
            type="button"
            className={cn(
              HIT_TARGET_INVISIBLE,
              "text-xs font-medium text-muted-foreground underline-offset-2 hover:underline",
            )}
            onClick={onRequestDraft}
            disabled={draftState.phase === "pending"}
            data-testid="taskmap-draft-cta"
          >
            {draftState.phase === "pending" ? "Drafting map…" : "Draft map"}
          </button>
          {draftState.phase === "failed" ? (
            <p
              className="m-0 text-xs text-muted-foreground"
              data-testid="taskmap-draft-notice"
            >
              {draftState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
