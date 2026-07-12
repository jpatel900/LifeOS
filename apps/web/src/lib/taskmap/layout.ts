import type { TaskMapGraph } from "./graph";

/**
 * FR-031 slice 5 — pure column-layering for the small (<=13 node, one
 * branching level) task-map DAG. No graph library: a node's column is its
 * longest-path distance from a root (a node with no incoming edge), so
 * branch/merge shapes read left-to-right without overlapping edges. Nodes
 * with no edges at all sit in column 0.
 */
export function computeNodeColumns(graph: TaskMapGraph): Map<string, number> {
  const nodeIds = graph.nodes.map((node) => node.id);
  const outgoing = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));

  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from) || !inDegree.has(edge.to)) {
      continue;
    }
    outgoing.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const columns = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const roots = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();

  // BFS layering from every root; a node's column is the max distance seen
  // from any root that reaches it. Guards against cycles (shouldn't occur —
  // validateGraph rejects them upstream) by capping visits per node.
  const visitCounts = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const queue: { id: string; depth: number }[] = roots.map((id) => ({
    id,
    depth: 0,
  }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift() as { id: string; depth: number };
    const guard = (visitCounts.get(id) ?? 0) + 1;
    visitCounts.set(id, guard);
    if (guard > nodeIds.length + 1) {
      continue;
    }

    if (depth > (columns.get(id) ?? 0)) {
      columns.set(id, depth);
    }

    for (const nextId of outgoing.get(id) ?? []) {
      queue.push({ id: nextId, depth: depth + 1 });
    }
  }

  return columns;
}

export interface TaskMapColumn {
  index: number;
  nodeIds: string[];
}

/** Groups node ids by column index, columns sorted ascending, node ids
 * within a column sorted for deterministic rendering. */
export function groupIntoColumns(graph: TaskMapGraph): TaskMapColumn[] {
  const columns = computeNodeColumns(graph);
  const byIndex = new Map<number, string[]>();

  for (const node of graph.nodes) {
    const index = columns.get(node.id) ?? 0;
    const bucket = byIndex.get(index) ?? [];
    bucket.push(node.id);
    byIndex.set(index, bucket);
  }

  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, nodeIds]) => ({ index, nodeIds: nodeIds.sort() }));
}
