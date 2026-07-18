import { groupIntoColumns } from "@/lib/taskmap/layout";
import type { TaskMapGraph } from "@/lib/taskmap/graph";

/**
 * FR-031 slice A (#664) — pure presentational geometry for the drawn DAG.
 *
 * The audit (#664 row 9) found the map renders nodes as chips in columns with
 * NO edges ever drawn, and the critical path shown only by collapsing others
 * away. This module turns the existing column layering (`groupIntoColumns`,
 * longest-path distance from a root) plus the code-computed critical path
 * (`computeCriticalPath`, passed in — never recomputed or AI-sourced here)
 * into concrete (x,y) node boxes and SVG edge path `d` strings.
 *
 * Deterministic by construction: node boxes are a FIXED size, so the SVG
 * anchor points and the absolutely-positioned DOM chips agree exactly — no
 * getBoundingClientRect measurement (which returns zeros under jsdom and
 * would make this untestable). Rows are biased so critical-path nodes sit on
 * the top row, letting the highlighted path read as a clean spine.
 */

export const NODE_WIDTH = 184;
export const NODE_HEIGHT = 60;
export const COL_GAP = 52;
export const ROW_GAP = 18;
export const CANVAS_PADDING = 10;

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
  onCriticalPath: boolean;
}

export interface PositionedEdge {
  from: string;
  to: string;
  /** SVG cubic-bezier path from the right edge of `from` to the left edge of
   * `to`, anchored at each box's vertical centre. */
  d: string;
  onCriticalPath: boolean;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Lay out the subgraph induced by `visibleIds`. `criticalIds` is the ordered
 * critical path (from `computeCriticalPath`); an edge is marked critical only
 * when its endpoints are consecutive in that order, so the highlight follows
 * the exact code-computed path and nothing else.
 */
export function computeGraphLayout(
  graph: TaskMapGraph,
  visibleIds: readonly string[],
  criticalIds: readonly string[],
): GraphLayout {
  const visible = new Set(visibleIds);
  const nodes = graph.nodes.filter((node) => visible.has(node.id));
  const edges = graph.edges.filter(
    (edge) => visible.has(edge.from) && visible.has(edge.to),
  );
  const restricted: TaskMapGraph = { nodes, edges };

  const columns = groupIntoColumns(restricted);
  const criticalSet = new Set(criticalIds);
  const criticalOrder = new Map(criticalIds.map((id, index) => [id, index]));

  const positioned = new Map<string, PositionedNode>();
  let maxRows = 0;
  let maxCol = 0;

  for (const column of columns) {
    maxCol = Math.max(maxCol, column.index);
    const ordered = [...column.nodeIds].sort((a, b) => {
      const aCritical = criticalSet.has(a);
      const bCritical = criticalSet.has(b);
      if (aCritical && bCritical) {
        return (criticalOrder.get(a) ?? 0) - (criticalOrder.get(b) ?? 0);
      }
      if (aCritical) return -1;
      if (bCritical) return 1;
      return compareIds(a, b);
    });

    ordered.forEach((id, row) => {
      positioned.set(id, {
        id,
        x: CANVAS_PADDING + column.index * (NODE_WIDTH + COL_GAP),
        y: CANVAS_PADDING + row * (NODE_HEIGHT + ROW_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        col: column.index,
        row,
        onCriticalPath: criticalSet.has(id),
      });
    });
    maxRows = Math.max(maxRows, ordered.length);
  }

  const width =
    CANVAS_PADDING * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * COL_GAP;
  const height =
    CANVAS_PADDING * 2 +
    Math.max(1, maxRows) * NODE_HEIGHT +
    Math.max(0, maxRows - 1) * ROW_GAP;

  const positionedEdges: PositionedEdge[] = [];
  for (const edge of edges) {
    const from = positioned.get(edge.from);
    const to = positioned.get(edge.to);
    if (!from || !to) continue;

    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const handle = Math.max(22, (x2 - x1) / 2);
    const d = `M ${x1} ${y1} C ${x1 + handle} ${y1}, ${x2 - handle} ${y2}, ${x2} ${y2}`;

    const fromOrder = criticalOrder.get(edge.from);
    const toOrder = criticalOrder.get(edge.to);
    const onCriticalPath =
      fromOrder !== undefined &&
      toOrder !== undefined &&
      toOrder === fromOrder + 1;

    positionedEdges.push({ from: edge.from, to: edge.to, d, onCriticalPath });
  }

  return {
    width,
    height,
    nodes: [...positioned.values()],
    edges: positionedEdges,
  };
}
