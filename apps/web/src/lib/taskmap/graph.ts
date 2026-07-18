export type TaskMapNode = {
  id: string;
  title: string;
  role: "required" | "optional" | "red";
  done?: boolean;
  // FR-031 slice 6: ISO timestamp of the user action that marked this node
  // done, or null/absent when not done. This is the source of truth for
  // completion (see `isNodeComplete`) — `done` is kept in sync alongside it
  // for backward compatibility with slice 5 fixtures/logic, but the
  // timestamp is what makes overplanning-dwell (map_approved_at -> first
  // node completion) computable later. AI drafts never set this field.
  completed_at?: string | null;
  red_reason?: string;
  red_condition?: string;
  // FR-031 slice F2 (#664): additive, optional per-node duration estimate in
  // minutes (schema_version 1.1+). Mirrors
  // `packages/schemas/src/task-map.ts` `TaskMapNodeSchema.estimated_minutes`.
  // See `apps/web/src/lib/taskmap/timeline.ts` for the deterministic
  // duration-weighted roll-up that consumes this field.
  estimated_minutes?: number;
  // FR-023 slice F4 (#678): additive marker for the single sub-60-second
  // physical opening move. Mirrors `packages/schemas/src/task-map.ts`
  // `TaskMapNodeSchema.two_minute_move`. At most one node carries it and it
  // is always a `required` node (both enforced by the schema superRefine).
  // The AI nominates it; `resolveFirstStepNode` decides the effective first
  // step from it (with a critical-path-head fallback).
  two_minute_move?: boolean;
};

/** True when a node has been marked done by either signal. Centralizes the
 * done-check so `completed_at` and `done` never drift apart in comparisons. */
export function isNodeComplete(node: TaskMapNode): boolean {
  return node.done === true || Boolean(node.completed_at);
}

export type TaskMapEdge = {
  from: string;
  to: string;
};

export type TaskMapGraph = {
  nodes: TaskMapNode[];
  edges: TaskMapEdge[];
};

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const MAX_REQUIRED_NODES = 7;
const MAX_OPTIONAL_NODES = 4;
const MAX_RED_NODES = 2;

export function validateGraph(graph: TaskMapGraph): ValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id);
    }
    nodeIds.add(node.id);
  }

  for (const nodeId of [...duplicateNodeIds].sort()) {
    errors.push(`Duplicate node id: ${nodeId}`);
  }

  const requiredNodes = graph.nodes.filter((node) => node.role === "required");
  const optionalNodes = graph.nodes.filter((node) => node.role === "optional");
  const redNodes = graph.nodes.filter((node) => node.role === "red");

  if (requiredNodes.length > MAX_REQUIRED_NODES) {
    errors.push(
      `Too many required nodes: ${requiredNodes.length} (max ${MAX_REQUIRED_NODES})`,
    );
  }

  if (optionalNodes.length > MAX_OPTIONAL_NODES) {
    errors.push(
      `Too many optional nodes: ${optionalNodes.length} (max ${MAX_OPTIONAL_NODES})`,
    );
  }

  if (redNodes.length > MAX_RED_NODES) {
    errors.push(
      `Too many red nodes: ${redNodes.length} (max ${MAX_RED_NODES})`,
    );
  }

  for (const node of redNodes) {
    if (!node.red_reason?.trim()) {
      errors.push(`Red node ${node.id} must have a non-empty red_reason`);
    }
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const validEdges: TaskMapEdge[] = [];

  for (const edge of graph.edges) {
    const fromExists = nodeIds.has(edge.from);
    const toExists = nodeIds.has(edge.to);

    if (!fromExists) {
      errors.push(`Edge references missing from node: ${edge.from}`);
    }
    if (!toExists) {
      errors.push(`Edge references missing to node: ${edge.to}`);
    }

    if (fromExists && toExists) {
      validEdges.push(edge);
      const fromNode = nodesById.get(edge.from);
      const toNode = nodesById.get(edge.to);
      if (fromNode?.role === "red" && toNode?.role === "required") {
        errors.push(
          `Red node ${edge.from} may not point to required node ${edge.to}`,
        );
      }
    }
  }

  const cycle = findCycle([...nodeIds].sort(), validEdges);
  if (cycle.length > 0) {
    errors.push(`Cycle detected: ${cycle.join(" -> ")}`);
  }

  errors.push(...findNestedBranchErrors(graph.nodes, validEdges));

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function computeCriticalPath(graph: TaskMapGraph): string[] {
  if (!validateGraph(graph).valid) {
    return [];
  }

  const requiredIds = new Set(
    graph.nodes
      .filter((node) => node.role === "required")
      .map((node) => node.id),
  );

  if (requiredIds.size === 0) {
    return [];
  }

  const requiredEdges = graph.edges.filter(
    (edge) => requiredIds.has(edge.from) && requiredIds.has(edge.to),
  );
  const outgoing = buildAdjacency([...requiredIds], requiredEdges);
  const memo = new Map<string, string[]>();

  const bestFrom = (nodeId: string): string[] => {
    const cached = memo.get(nodeId);
    if (cached) {
      return cached;
    }

    const childPaths = (outgoing.get(nodeId) ?? []).map((childId) =>
      bestFrom(childId),
    );
    const bestChildPath = chooseBestPath(childPaths);
    const path = [nodeId, ...bestChildPath];
    memo.set(nodeId, path);
    return path;
  };

  return chooseBestPath(
    [...requiredIds].sort().map((nodeId) => bestFrom(nodeId)),
  );
}

/**
 * FR-023 slice F4 (#678) — the effective first step of an approved map.
 *
 * The first node of a breakdown and `tasks.first_tiny_step` are ONE fact
 * (FR-023 criterion 3). This resolver is that single derivation, shared by
 * both the Supabase approve (`approveTaskMap`) and the local approve reducer
 * (`approveTaskMapLocal`) so the two never disagree.
 *
 * Effective first node =
 *   - the AI-nominated `two_minute_move` node IF it is a structural entry
 *     node of the required subgraph (in-degree 0 among required->required
 *     edges — the exact edge set `computeCriticalPath` walks, so the flag
 *     branch and the fallback share coordinates), ELSE
 *   - the head of the code-computed critical path.
 *
 * Returns null only for a degenerate graph with no critical path (e.g. no
 * required nodes, or a structurally invalid graph); callers then leave
 * `first_tiny_step` untouched rather than writing null.
 */
export function resolveFirstStepNode(graph: TaskMapGraph): TaskMapNode | null {
  if (!validateGraph(graph).valid) {
    return null;
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const requiredIds = new Set(
    graph.nodes
      .filter((node) => node.role === "required")
      .map((node) => node.id),
  );

  const requiredInDegree = new Map<string, number>(
    [...requiredIds].map((nodeId) => [nodeId, 0]),
  );
  for (const edge of graph.edges) {
    if (requiredIds.has(edge.from) && requiredIds.has(edge.to)) {
      requiredInDegree.set(edge.to, (requiredInDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const flagged = graph.nodes.find((node) => node.two_minute_move === true);
  if (
    flagged &&
    requiredIds.has(flagged.id) &&
    (requiredInDegree.get(flagged.id) ?? 0) === 0
  ) {
    return flagged;
  }

  const criticalPath = computeCriticalPath(graph);
  const headId = criticalPath[0];
  return headId ? (nodesById.get(headId) ?? null) : null;
}

export function cutScopeCandidates(graph: TaskMapGraph): TaskMapNode[] {
  return graph.nodes
    .filter((node) => node.role === "optional" && !isNodeComplete(node))
    .sort(
      (left, right) =>
        compareStrings(left.title, right.title) ||
        compareStrings(left.id, right.id),
    );
}

function buildAdjacency(
  nodeIds: string[],
  edges: TaskMapEdge[],
): Map<string, string[]> {
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as string[]]));

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  for (const destinations of adjacency.values()) {
    destinations.sort();
  }

  return adjacency;
}

function findCycle(nodeIds: string[], edges: TaskMapEdge[]): string[] {
  const adjacency = buildAdjacency(nodeIds, edges);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string): string[] => {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      return [...stack.slice(cycleStart), nodeId];
    }
    if (visited.has(nodeId)) {
      return [];
    }

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const nextId of adjacency.get(nodeId) ?? []) {
      const cycle = visit(nextId);
      if (cycle.length > 0) {
        return cycle;
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return [];
  };

  for (const nodeId of nodeIds) {
    const cycle = visit(nodeId);
    if (cycle.length > 0) {
      return cycle;
    }
  }

  return [];
}

function chooseBestPath(paths: string[][]): string[] {
  return paths.reduce<string[]>((best, candidate) => {
    if (candidate.length > best.length) {
      return candidate;
    }
    if (candidate.length < best.length) {
      return best;
    }
    return comparePath(candidate, best) < 0 ? candidate : best;
  }, []);
}

function comparePath(left: string[], right: string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = compareStrings(left[index], right[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.length - right.length;
}

function findNestedBranchErrors(
  nodes: TaskMapNode[],
  edges: TaskMapEdge[],
): string[] {
  const requiredIds = new Set(
    nodes.filter((node) => node.role === "required").map((node) => node.id),
  );
  const requiredEdges = edges.filter(
    (edge) => requiredIds.has(edge.from) && requiredIds.has(edge.to),
  );
  const inDegree = new Map([...requiredIds].map((nodeId) => [nodeId, 0]));
  const outDegree = new Map([...requiredIds].map((nodeId) => [nodeId, 0]));

  for (const edge of requiredEdges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const forkNodes = [...requiredIds]
    .filter((nodeId) => (outDegree.get(nodeId) ?? 0) > 1)
    .sort();
  const mergeNodes = [...requiredIds]
    .filter((nodeId) => (inDegree.get(nodeId) ?? 0) > 1)
    .sort();
  const errors: string[] = [];

  // One-level branching rule (FR-031): edges may branch (one fork node,
  // out-degree > 1) and merge back (one merge node, in-degree > 1) — a
  // diamond is legal. "No nested sub-branches" is enforced as: at most ONE
  // fork node and at most ONE merge node among required nodes, and no single
  // node may both merge and fork (that would chain two branch shapes through
  // one node). A second fork anywhere — inside an open branch arm or after
  // the merge — exceeds one level and is rejected.
  if (forkNodes.length > 1) {
    errors.push(
      `Nested required branching: multiple fork nodes (${forkNodes.join(", ")})`,
    );
  }
  if (mergeNodes.length > 1) {
    errors.push(
      `Nested required branching: multiple merge nodes (${mergeNodes.join(", ")})`,
    );
  }
  for (const nodeId of forkNodes) {
    if ((inDegree.get(nodeId) ?? 0) > 1) {
      errors.push(
        `Nested required branching: node ${nodeId} both merges and forks`,
      );
    }
  }

  return errors;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
