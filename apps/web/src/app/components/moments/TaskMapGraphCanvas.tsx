"use client";

import { useId } from "react";
import type { TaskMapGraph, TaskMapNode } from "@/lib/taskmap/graph";
import { TaskMapNodeChip } from "./TaskMapNodeChip";
import { computeGraphLayout } from "./taskMapGraphLayout";

/**
 * FR-031 slice A (#664) — the actual drawn DAG.
 *
 * Renders the visible subset of the graph as absolutely-positioned chips over
 * an SVG edge layer, so branch/merge dependencies are visible as connectors
 * (the audit's row-9 gap) and the code-computed critical path is highlighted
 * WITHIN the full graph — distinct edge treatment (thicker, accent-coloured),
 * not merely by collapsing other nodes away.
 *
 * Purely presentational over data that already exists: `graph.edges`, the
 * column layering, and the passed-in `criticalIds` (from `computeCriticalPath`
 * — never recomputed or AI-sourced here). Node boxes are fixed-size so the SVG
 * anchor points and the DOM chips line up by construction.
 */
export interface TaskMapGraphCanvasProps {
  graph: TaskMapGraph;
  /** Node ids to draw (critical subset when collapsed, all nodes when expanded). */
  visibleIds: readonly string[];
  /** Ordered critical path from `computeCriticalPath`. */
  criticalIds: readonly string[];
  /** Node to emphasise (first not-done critical node). */
  emphasizedId?: string | null;
  onToggleNodeCompletion?: (nodeId: string) => void;
  testId?: string;
}

export function TaskMapGraphCanvas({
  graph,
  visibleIds,
  criticalIds,
  emphasizedId,
  onToggleNodeCompletion,
  testId,
}: TaskMapGraphCanvasProps) {
  const rawId = useId();
  // Marker ids must be valid + unique per mounted canvas; useId() can emit
  // ':' which is illegal in a url(#...) reference, so strip to a safe token.
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const arrowId = `tm-arrow-${safeId}`;
  const arrowCriticalId = `tm-arrow-crit-${safeId}`;

  const layout = computeGraphLayout(graph, visibleIds, criticalIds);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <div
      className="relative"
      style={{ width: layout.width, height: layout.height }}
      data-testid={testId}
      data-taskmap-canvas="true"
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        fill="none"
        aria-hidden="true"
        data-testid="taskmap-edges"
      >
        <style>{`
          .tm-edge { stroke-dasharray: 1; stroke-dashoffset: 0; }
          @media (prefers-reduced-motion: no-preference) {
            .tm-edge {
              stroke-dasharray: var(--tm-len, 260);
              stroke-dashoffset: var(--tm-len, 260);
              animation: tm-draw var(--motion-slow) var(--motion-ease) forwards;
            }
          }
          @keyframes tm-draw { to { stroke-dashoffset: 0; } }
        `}</style>
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--border)" />
          </marker>
          <marker
            id={arrowCriticalId}
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--acc)" />
          </marker>
        </defs>

        {layout.edges.map((edge) => (
          <path
            key={`${edge.from}->${edge.to}`}
            className="tm-edge"
            d={edge.d}
            stroke={edge.onCriticalPath ? "var(--acc)" : "var(--border)"}
            strokeWidth={edge.onCriticalPath ? 2.5 : 1.5}
            strokeOpacity={edge.onCriticalPath ? 1 : 0.85}
            strokeLinecap="round"
            markerEnd={`url(#${edge.onCriticalPath ? arrowCriticalId : arrowId})`}
            data-testid={`taskmap-edge-${edge.from}-${edge.to}`}
            data-edge="true"
            data-critical={edge.onCriticalPath ? "true" : "false"}
          />
        ))}
      </svg>

      {layout.nodes.map((positioned) => {
        const node = nodesById.get(positioned.id) as TaskMapNode | undefined;
        if (!node) return null;
        return (
          <div
            key={positioned.id}
            className="absolute overflow-hidden [&>*]:h-full [&>*]:w-full [&>*]:justify-center"
            style={{
              left: positioned.x,
              top: positioned.y,
              width: positioned.width,
              height: positioned.height,
            }}
          >
            <TaskMapNodeChip
              node={node}
              emphasized={positioned.id === emphasizedId}
              onToggleComplete={onToggleNodeCompletion}
            />
          </div>
        );
      })}
    </div>
  );
}
