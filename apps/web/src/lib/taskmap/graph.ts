export type TaskMapNode = {
  id: string;
  title: string;
  role: "required" | "optional" | "red";
  done?: boolean;
  red_reason?: string;
  red_condition?: string;
};

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

export function cutScopeCandidates(graph: TaskMapGraph): TaskMapNode[] {
  return graph.nodes
    .filter((node) => node.role === "optional" && !node.done)
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

  const branchNodes = [...requiredIds]
    .filter(
      (nodeId) =>
        (inDegree.get(nodeId) ?? 0) > 1 || (outDegree.get(nodeId) ?? 0) > 1,
    )
    .sort();
  const branchNodeIds = new Set(branchNodes);
  const outgoing = buildAdjacency([...requiredIds], requiredEdges);
  const errors: string[] = [];

  // One-level branching rule: among required nodes, any node with in-degree > 1
  // or out-degree > 1 is a branch/merge node. A valid map may contain a single
  // branch shape, but no branch/merge node may reach another branch/merge node
  // through one or more required-node edges; that would create nested branching.
  for (const startId of branchNodes) {
    const queue = [...(outgoing.get(startId) ?? [])];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || seen.has(nodeId)) {
        continue;
      }
      seen.add(nodeId);

      if (branchNodeIds.has(nodeId)) {
        errors.push(`Nested required branching path: ${startId} -> ${nodeId}`);
        break;
      }

      queue.push(...(outgoing.get(nodeId) ?? []));
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
