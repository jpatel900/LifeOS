import {
  computeCriticalPath,
  isNodeComplete,
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

  const nextActionable =
    criticalNodes.find((node) => !isNodeComplete(node)) ?? null;

  const hiddenNodes = graph.nodes.filter((node) => !criticalSet.has(node.id));

  return {
    criticalNodes,
    nextActionableId: nextActionable ? nextActionable.id : null,
    hiddenNodes,
  };
}

/**
 * FR-031 slice 6 — pure, reversible node-completion toggle. Marking a node
 * done is a USER action on the approved map, never an AI one: this function
 * has no AI call and no side effects, and the caller (data layer / local
 * reducer) is responsible for persisting the result through
 * `validateTaskMapForPersistence`.
 *
 * Red nodes are never actionable (FR-031) and an unknown node id is a no-op
 * — both return the exact same `graph` reference so callers can detect a
 * rejected toggle with `result === graph`. Toggling an already-done node
 * undoes it (calm coaching, no ratchet): `completed_at` and `done` are
 * cleared together, keeping both signals in sync.
 */
export function toggleNodeCompletion(
  graph: TaskMapGraph,
  nodeId: string,
  nowIso: string,
): TaskMapGraph {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.role === "red") {
    return graph;
  }

  const wasComplete = isNodeComplete(node);

  return {
    ...graph,
    nodes: graph.nodes.map((candidate) =>
      candidate.id === nodeId
        ? {
            ...candidate,
            done: !wasComplete,
            completed_at: wasComplete ? null : nowIso,
          }
        : candidate,
    ),
  };
}

/**
 * FR-031 slice 8 — pure completion carry-forward for map revision. When a
 * regen draft is approved, it overwrites `progression_map` wholesale; this
 * function is the ONE place (server `approveTaskMap` and the client's
 * `approveTaskMapLocal` reducer both call it) that decides which nodes in
 * the newly-approved graph keep their prior completion state, so the two
 * call sites can never drift on the rule.
 *
 * Rule: a node whose id survives from `previousGraph` into `nextGraph` AND
 * was complete there AND is not `red` in the new graph carries its
 * `done`/`completed_at` forward unchanged. A dropped id, a renamed id (no
 * match), or a node whose new role is `red` all get no carry-forward — red
 * nodes are never actionable/completable (mirrors `toggleNodeCompletion`).
 */
export function carryForwardNodeCompletion(
  previousGraph: TaskMapGraph | null | undefined,
  nextGraph: TaskMapGraph,
): TaskMapGraph {
  if (!previousGraph?.nodes.length) {
    return nextGraph;
  }

  const previousById = new Map(
    previousGraph.nodes.map((node) => [node.id, node]),
  );

  let changed = false;
  const nodes = nextGraph.nodes.map((node) => {
    const prior = previousById.get(node.id);
    if (!prior || node.role === "red" || !isNodeComplete(prior)) {
      return node;
    }

    changed = true;
    return {
      ...node,
      done: true,
      completed_at: prior.completed_at ?? null,
    };
  });

  return changed ? { ...nextGraph, nodes } : nextGraph;
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
