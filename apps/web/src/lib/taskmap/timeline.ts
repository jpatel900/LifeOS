import type { DurationProfile } from "@lifeos/schemas";
import { applyStoredDuration } from "@/lib/learning/learningSurface";
import {
  isNodeComplete,
  validateGraph,
  type TaskMapEdge,
  type TaskMapGraph,
  type TaskMapNode,
} from "./graph";

/**
 * FR-031 slice F2 (#664) — deterministic timeline estimation from the graph.
 *
 * Owner clarification (2026-07-17): the breakdown + critical path must
 * ESTIMATE TIMELINES. This module is the CODE roll-up half of that contract
 * (per the same anti-hallucination doctrine `computeCriticalPath` already
 * follows in `graph.ts`): the AI may draft a per-node `estimated_minutes`
 * (an approved-like-any-other-draft-field input), but summing those minutes
 * along a duration-weighted longest path, applying a learned recalibration,
 * and turning that into a total/remaining/ETA is ALWAYS computed here, never
 * asserted by AI output.
 *
 * This is a NEW function, not a replacement for `computeCriticalPath`. The
 * existing hop-count critical path stays exactly as-is (its callers —
 * `collapse.ts`'s default view, `TaskMapView`'s critical-path highlight —
 * are untouched): this module adds a second, duration-weighted view of the
 * same graph, so a caller that wants "the code-computed path used for
 * default collapse" and a caller that wants "the estimated timeline" both
 * have an explicit, separately-named function to call.
 *
 * No ambient clock: every function here takes `now`/a start time as an
 * explicit parameter (mirrors `mapApprovedAgeLabel` in `collapse.ts`) so the
 * caller/UI supplies "now" and the kernel stays pure and testable.
 */

export type DurationSource = "learned_profile" | "ai_estimate" | "none";

export interface NodeDurationResolution {
  minutes: number;
  source: DurationSource;
}

export type DurationResolver = (node: TaskMapNode) => NodeDurationResolution;

/**
 * Resolves ONE node's duration in minutes, in precedence order:
 * learned `duration_profiles` recalibration of the AI estimate > the raw AI
 * (or user-approved) `estimated_minutes` > none (0 minutes, flagged
 * `partial` by the caller). A profile never fabricates minutes for a node
 * that carries no estimate at all — there is nothing to recalibrate.
 *
 * Reuses the house area-scoped profile lookup (`applyStoredDuration` /
 * `AREA_DURATION_TASK_TYPE` in `lib/learning/learningSurface.ts`) rather
 * than inventing a parallel matching scheme: `duration_profiles` is
 * area-scoped (no per-task-map-node `task_type` exists), so "a matching
 * profile" means the profile for this map's area.
 */
export function resolveNodeDuration(
  node: TaskMapNode,
  profiles: DurationProfile[],
  areaId: string | null,
): NodeDurationResolution {
  const estimate = node.estimated_minutes;
  if (
    typeof estimate !== "number" ||
    !Number.isFinite(estimate) ||
    estimate <= 0
  ) {
    return { minutes: 0, source: "none" };
  }

  const adjusted = applyStoredDuration(profiles, areaId, estimate);
  if (adjusted !== null) {
    return { minutes: adjusted, source: "learned_profile" };
  }

  return { minutes: estimate, source: "ai_estimate" };
}

export interface TaskMapTimelineResult {
  /** Required-node ids on the duration-weighted longest path, root to leaf. */
  criticalPath: string[];
  /** Sum of resolved minutes for every node on `criticalPath`. */
  totalMinutes: number;
  /** Same sum, excluding nodes already marked complete — this is what the
   * ETA is computed from. */
  remainingMinutes: number;
  /** True when at least one node contributing to `criticalPath` resolved to
   * `source: "none"` (no AI estimate and no learned profile) — the total is
   * a lower bound, not a complete estimate. Also true for any malformed /
   * graph-invalid input (fail closed to "no estimate", never a guess). */
  partial: boolean;
  /** ISO timestamp = the supplied `now` plus `remainingMinutes`, or null
   * only when the input graph itself failed validation. */
  etaIso: string | null;
}

/** Pure: `now` plus whole `minutes` (negative minutes clamp to 0). */
export function estimateEtaIso(now: Date, minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  return new Date(now.getTime() + safeMinutes * 60 * 1000).toISOString();
}

interface PathAccumulator {
  path: string[];
  totalMinutes: number;
  remainingMinutes: number;
  partial: boolean;
}

const EMPTY_ACCUMULATOR: PathAccumulator = {
  path: [],
  totalMinutes: 0,
  remainingMinutes: 0,
  partial: false,
};

const FAILED_TIMELINE: TaskMapTimelineResult = {
  criticalPath: [],
  totalMinutes: 0,
  remainingMinutes: 0,
  partial: true,
  etaIso: null,
};

/**
 * The duration-weighted critical path (longest path by summed minutes
 * through required nodes only — red and optional nodes never contribute or
 * gate this path, matching `computeCriticalPath`'s required-only scope) plus
 * the total/remaining estimate and an ETA from `now`.
 *
 * Fails closed: any graph that does not pass `validateGraph` (cycles,
 * duplicate ids, dangling edges, nested branching, etc.) returns the
 * all-zero/`partial: true`/`etaIso: null` result rather than guessing at a
 * path through unvalidated structure.
 */
export function computeTaskMapTimeline(
  graph: TaskMapGraph,
  resolveDuration: DurationResolver,
  now: Date,
): TaskMapTimelineResult {
  if (!validateGraph(graph).valid) {
    return FAILED_TIMELINE;
  }

  const requiredNodes = graph.nodes.filter((node) => node.role === "required");
  if (requiredNodes.length === 0) {
    return {
      criticalPath: [],
      totalMinutes: 0,
      remainingMinutes: 0,
      partial: false,
      etaIso: now.toISOString(),
    };
  }

  const requiredIds = new Set(requiredNodes.map((node) => node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const requiredEdges = graph.edges.filter(
    (edge) => requiredIds.has(edge.from) && requiredIds.has(edge.to),
  );
  const outgoing = buildAdjacency([...requiredIds], requiredEdges);
  const memo = new Map<string, PathAccumulator>();

  const bestFrom = (nodeId: string): PathAccumulator => {
    const cached = memo.get(nodeId);
    if (cached) {
      return cached;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return EMPTY_ACCUMULATOR;
    }

    const resolution = resolveDuration(node);
    const complete = isNodeComplete(node);
    const childAccumulators = (outgoing.get(nodeId) ?? []).map((childId) =>
      bestFrom(childId),
    );
    const bestChild = chooseBestAccumulator(childAccumulators);

    const accumulator: PathAccumulator = {
      path: [nodeId, ...bestChild.path],
      totalMinutes: resolution.minutes + bestChild.totalMinutes,
      remainingMinutes:
        (complete ? 0 : resolution.minutes) + bestChild.remainingMinutes,
      partial: resolution.source === "none" || bestChild.partial,
    };
    memo.set(nodeId, accumulator);
    return accumulator;
  };

  const best = chooseBestAccumulator(
    [...requiredIds].sort().map((nodeId) => bestFrom(nodeId)),
  );

  return {
    criticalPath: best.path,
    totalMinutes: best.totalMinutes,
    remainingMinutes: best.remainingMinutes,
    partial: best.partial,
    etaIso: estimateEtaIso(now, best.remainingMinutes),
  };
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

/**
 * Picks the accumulator with the greatest `totalMinutes`; ties (including
 * the common all-zero/no-data case) are broken deterministically by the
 * lexicographically smallest path, mirroring `chooseBestPath` in
 * `graph.ts`. An empty candidate list (a leaf node with no children) is the
 * base case: no further path, zero additional minutes.
 */
function chooseBestAccumulator(candidates: PathAccumulator[]): PathAccumulator {
  if (candidates.length === 0) {
    return EMPTY_ACCUMULATOR;
  }

  return candidates.reduce((best, candidate) => {
    if (candidate.totalMinutes > best.totalMinutes) {
      return candidate;
    }
    if (candidate.totalMinutes < best.totalMinutes) {
      return best;
    }
    return comparePath(candidate.path, best.path) < 0 ? candidate : best;
  });
}

function comparePath(left: string[], right: string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] < right[index]) {
      return -1;
    }
    if (left[index] > right[index]) {
      return 1;
    }
  }
  return left.length - right.length;
}
