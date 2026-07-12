"use client";

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
 */
export type TaskMapDraftUiState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "ready"; draft: TaskMapGraph & { schema_version: "1.0" } }
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
  onApproveDraft(graph: TaskMapGraph & { schema_version: "1.0" }): void;
}

export function TaskMapSection({
  task,
  progressionNodes,
  draftState,
  now,
  onRequestDraft,
  onDismissDraft,
  onApproveDraft,
}: TaskMapSectionProps) {
  if (task && task.map_status === "approved" && task.progression_map) {
    const validated = validateTaskMapForPersistence(task.progression_map);
    if (validated.ok) {
      return (
        <TaskMapView
          graph={validated.graph as TaskMapGraph}
          mapApprovedAt={task.map_approved_at ?? null}
          now={now}
        />
      );
    }
    // Defensive fallback: a persisted map that no longer validates never
    // blocks the surface — drop through to the rail below.
  }

  if (draftState.phase === "ready") {
    return (
      <TaskMapDraftReview
        draft={draftState.draft}
        onApprove={onApproveDraft}
        onDismiss={onDismissDraft}
      />
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
