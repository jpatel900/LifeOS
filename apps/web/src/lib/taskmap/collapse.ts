import {
  computeCriticalPath,
  type TaskMapGraph,
  type TaskMapNode,
} from "./graph";

/**
 * FR-031 slice 5 — pure collapse/expand derivation for the approved map view.
 *
 * The default view shows only the code-computed critical path
 * (`computeCriticalPath`), with the next actionable (first not-yet-done
 * critical) node identified separately so the UI can emphasize it. Every
 * other node (optional, red, or a required node that lost the branch race)
 * is folded behind one expand affordance. No AI call and no UI state feeds
 * this selection — it is a deterministic function of the approved graph.
 */
export interface TaskMapCollapseView {
  criticalNodes: TaskMapNode[];
  /** First not-done node on the critical path, or null if the path is empty
   * or every critical node is already done. */
  nextActionableId: string | null;
  /** Every node not on the critical path (optional, red, off-path required). */
  hiddenNodes: TaskMapNode[];
}

export function buildTaskMapCollapseView(
  graph: TaskMapGraph,
): TaskMapCollapseView {
  const criticalIds = computeCriticalPath(graph);
  const criticalSet = new Set(criticalIds);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const criticalNodes = criticalIds
    .map((id) => nodesById.get(id))
    .filter((node): node is TaskMapNode => node !== undefined);

  const nextActionable = criticalNodes.find((node) => !node.done) ?? null;

  const hiddenNodes = graph.nodes.filter((node) => !criticalSet.has(node.id));

  return {
    criticalNodes,
    nextActionableId: nextActionable ? nextActionable.id : null,
    hiddenNodes,
  };
}

/**
 * Presentation-only "map approved N ago" label. Pure over an explicit `now`
 * (no ambient Date.now) so it is unit-testable and deterministic. Kept
 * intentionally coarse (days, not hours/minutes) — this is a subtle,
 * non-nagging age marker, not a countdown.
 */
export function mapApprovedAgeLabel(
  mapApprovedAt: string | null,
  now: Date,
): string | null {
  if (!mapApprovedAt) {
    return null;
  }

  const approvedAt = new Date(mapApprovedAt);
  if (Number.isNaN(approvedAt.getTime())) {
    return null;
  }

  const diffMs = now.getTime() - approvedAt.getTime();
  if (diffMs < 0) {
    return "Mapped just now";
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return "Mapped just now";
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1
      ? "Mapped 1 hour ago"
      : `Mapped ${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? "Mapped 1 day ago" : `Mapped ${diffDays} days ago`;
}
