"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildTaskMapCollapseView,
  mapApprovedAgeLabel,
} from "@/lib/taskmap/collapse";
import { validateGraph, type TaskMapGraph } from "@/lib/taskmap/graph";
import { TaskMapNodeChip } from "./TaskMapNodeChip";
import { TaskMapGraphCanvas } from "./TaskMapGraphCanvas";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";

/**
 * FR-031 slice 5 + slice A (#664) — approved map view, now DRAWN as a graph.
 *
 * Default view collapses to the code-computed critical path
 * (`computeCriticalPath` via `buildTaskMapCollapseView`) and draws it as a
 * connected spine, next-actionable node emphasized. Expanding renders the
 * FULL DAG — every node kept in its dependency position (not a flat list) —
 * with the critical path highlighted WITHIN it via distinct accent edges, so
 * one view shows the whole graph with the path visible through it (the audit's
 * row-9 gap: #664). Edges are real SVG connectors over the existing column
 * layout — no schema/engine change. No gamification, no scores, no streaks.
 *
 * Degrade-to-rail safety (NFR-004): if the graph fails `validateGraph` the
 * drawn canvas is skipped and the nodes render as a plain, non-throwing chip
 * list — the caller (`TaskMapSection`) already falls back to the v0 rail for
 * un-persistable maps, so this is a belt-and-braces inner guard.
 */
export interface TaskMapViewProps {
  graph: TaskMapGraph;
  mapApprovedAt: string | null;
  now: Date;
  /** FR-031 slice 6: user-action-only completion toggle. Omit to render the
   * map as read-only (chips stay non-interactive presentation). */
  onToggleNodeCompletion?: (nodeId: string) => void;
}

export function TaskMapView({
  graph,
  mapApprovedAt,
  now,
  onToggleNodeCompletion,
}: TaskMapViewProps) {
  const [expanded, setExpanded] = useState(false);
  const view = buildTaskMapCollapseView(graph);
  const ageLabel = mapApprovedAgeLabel(mapApprovedAt, now);
  const criticalIds = view.criticalNodes.map((node) => node.id);
  const isValid = validateGraph(graph).valid;

  const ageLabelEl = ageLabel ? (
    <p
      className="text-[11px] text-muted-foreground"
      data-testid="taskmap-age-label"
    >
      {ageLabel}
    </p>
  ) : null;

  // Degrade path: an invalid graph can't be laid out safely — fall back to a
  // plain chip list rather than drawing edges over broken geometry.
  if (!isValid) {
    return (
      <div data-testid="taskmap-view" className="grid gap-2">
        {ageLabelEl}
        <ul
          className="flex flex-wrap items-start gap-2"
          data-testid="taskmap-fallback"
        >
          {graph.nodes.map((node) => (
            <li key={node.id}>
              <TaskMapNodeChip
                node={node}
                onToggleComplete={onToggleNodeCompletion}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div data-testid="taskmap-view" className="grid gap-2">
      {ageLabelEl}

      {expanded ? (
        <div className="grid gap-2" data-testid="taskmap-hidden">
          <div className="overflow-x-auto" data-testid="taskmap-full-graph">
            <TaskMapGraphCanvas
              graph={graph}
              visibleIds={graph.nodes.map((node) => node.id)}
              criticalIds={criticalIds}
              emphasizedId={view.nextActionableId}
              onToggleNodeCompletion={onToggleNodeCompletion}
            />
          </div>
          <button
            type="button"
            className={cn(
              HIT_TARGET_INVISIBLE,
              "text-xs font-medium text-muted-foreground underline-offset-2 hover:underline",
            )}
            onClick={() => setExpanded(false)}
            data-testid="taskmap-collapse"
          >
            Collapse
          </button>
        </div>
      ) : (
        <>
          <div
            className="overflow-x-auto"
            data-testid="taskmap-critical-path"
          >
            <TaskMapGraphCanvas
              graph={graph}
              visibleIds={criticalIds}
              criticalIds={criticalIds}
              emphasizedId={view.nextActionableId}
              onToggleNodeCompletion={onToggleNodeCompletion}
            />
          </div>
          {view.hiddenNodes.length > 0 ? (
            <button
              type="button"
              className={cn(
                HIT_TARGET_INVISIBLE,
                "text-xs font-medium tabular-nums text-muted-foreground underline-offset-2 hover:underline",
              )}
              onClick={() => setExpanded(true)}
              data-testid="taskmap-expand"
            >
              +{view.hiddenNodes.length} more (optional / other paths)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
