import type { TaskMapGraphDraft } from "@lifeos/schemas";

import { isNodeComplete } from "./graph";

export type MapDwellInput = {
  mapApprovedAt: string | null;
  graph: TaskMapGraphDraft | null;
};

export type MapDwellSummary = {
  dwellMs: number | null;
  firstCompletionAt: string | null;
};

export type MapProgressSummary = {
  total: number;
  completed: number;
  requiredTotal: number;
  requiredCompleted: number;
  optionalTotal: number;
  optionalCompleted: number;
};

const EMPTY_PROGRESS: MapProgressSummary = {
  total: 0,
  completed: 0,
  requiredTotal: 0,
  requiredCompleted: 0,
  optionalTotal: 0,
  optionalCompleted: 0,
};

export function computeMapDwell(input: MapDwellInput): MapDwellSummary {
  const { mapApprovedAt, graph } = input;

  if (!mapApprovedAt || !graph) {
    return { dwellMs: null, firstCompletionAt: null };
  }

  const approvedMs = Date.parse(mapApprovedAt);
  if (!Number.isFinite(approvedMs)) {
    return { dwellMs: null, firstCompletionAt: null };
  }

  const firstCompletion = graph.nodes.reduce<{
    completedAt: string;
    completedMs: number;
  } | null>((earliest, node) => {
    if (!node.completed_at) {
      return earliest;
    }

    const completedMs = Date.parse(node.completed_at);
    if (!Number.isFinite(completedMs)) {
      return earliest;
    }

    if (!earliest || completedMs < earliest.completedMs) {
      return { completedAt: node.completed_at, completedMs };
    }

    return earliest;
  }, null);

  if (!firstCompletion) {
    return { dwellMs: null, firstCompletionAt: null };
  }

  return {
    dwellMs: Math.max(0, firstCompletion.completedMs - approvedMs),
    firstCompletionAt: firstCompletion.completedAt,
  };
}

export function summarizeMapProgress(
  graph: TaskMapGraphDraft | null,
): MapProgressSummary {
  if (!graph) {
    return { ...EMPTY_PROGRESS };
  }

  return graph.nodes.reduce<MapProgressSummary>(
    (summary, node) => {
      if (node.role === "red") {
        return summary;
      }

      const complete = isNodeComplete(node);
      summary.total += 1;
      if (complete) {
        summary.completed += 1;
      }

      if (node.role === "required") {
        summary.requiredTotal += 1;
        if (complete) {
          summary.requiredCompleted += 1;
        }
      }

      if (node.role === "optional") {
        summary.optionalTotal += 1;
        if (complete) {
          summary.optionalCompleted += 1;
        }
      }

      return summary;
    },
    { ...EMPTY_PROGRESS },
  );
}
