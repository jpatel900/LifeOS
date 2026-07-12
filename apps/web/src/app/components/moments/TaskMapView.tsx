"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildTaskMapCollapseView,
  mapApprovedAgeLabel,
} from "@/lib/taskmap/collapse";
import { groupIntoColumns } from "@/lib/taskmap/layout";
import type { TaskMapGraph, TaskMapNode } from "@/lib/taskmap/graph";
import { TaskMapNodeChip } from "./TaskMapNodeChip";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";

/**
 * FR-031 slice 5 — approved map view, collapsed to the critical path.
 *
 * Default view shows only the code-computed critical path
 * (`computeCriticalPath` via `buildTaskMapCollapseView`), with the next
 * actionable node emphasized. Optional/red/off-path nodes sit behind one
 * expand affordance. No gamification, no scores, no streaks — this is a
 * calm progress readout, not a dashboard.
 */
export interface TaskMapViewProps {
  graph: TaskMapGraph;
  mapApprovedAt: string | null;
  now: Date;
  /** FR-031 slice 6: user-action-only completion toggle. Omit to render the
   * map as read-only (chips stay non-interactive presentation). */
  onToggleNodeCompletion?: (nodeId: string) => void;
}

function columnsFor(nodes: TaskMapNode[], graph: TaskMapGraph) {
  const ids = new Set(nodes.map((node) => node.id));
  const restrictedGraph: TaskMapGraph = {
    nodes,
    edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
  return groupIntoColumns(restrictedGraph);
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
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const criticalColumns = columnsFor(view.criticalNodes, graph);

  return (
    <div data-testid="taskmap-view" className="grid gap-2">
      {ageLabel ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="taskmap-age-label"
        >
          {ageLabel}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-start gap-3"
        data-testid="taskmap-critical-path"
      >
        {criticalColumns.map((column) => (
          <div key={column.index} className="flex flex-col gap-2">
            {column.nodeIds.map((id) => {
              const node = nodesById.get(id);
              if (!node) return null;
              return (
                <TaskMapNodeChip
                  key={id}
                  node={node}
                  emphasized={id === view.nextActionableId}
                  onToggleComplete={onToggleNodeCompletion}
                />
              );
            })}
          </div>
        ))}
      </div>

      {view.hiddenNodes.length > 0 ? (
        <div>
          {!expanded ? (
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
          ) : (
            <div className="grid gap-2" data-testid="taskmap-hidden">
              <ul className="flex flex-wrap items-start gap-2">
                {view.hiddenNodes.map((node) => (
                  <li key={node.id}>
                    <TaskMapNodeChip
                      node={node}
                      onToggleComplete={onToggleNodeCompletion}
                    />
                  </li>
                ))}
              </ul>
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
          )}
        </div>
      ) : null}
    </div>
  );
}
