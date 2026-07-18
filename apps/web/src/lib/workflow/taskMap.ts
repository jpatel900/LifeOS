import { validateTaskMapForPersistence } from "../taskmap/persistence";
import {
  carryForwardNodeCompletion,
  toggleNodeCompletion,
} from "../taskmap/collapse";
import { resolveFirstStepNode, type TaskMapGraph } from "../taskmap/graph";
import { nowIso, type WorkflowState } from "./shared";

// FR-031 slice 5: local-first fold-back for the approved task-map graph.
// Mirrors `updateTaskFirstTinyStep` — a pure reducer patch so the UI flips
// from the v0 rail to `TaskMapView` immediately, independent of whether the
// best-effort Supabase persist (in WorkflowContext) succeeds. The caller is
// responsible for validating the graph (`validateTaskMapForPersistence`)
// before dispatching this — the reducer trusts its input.
//
// FR-031 slice 8: when the task already has an approved map (a regen
// revision), `carryForwardNodeCompletion` runs against that prior graph
// before folding in the new one, so a completed node that survives (same
// id, non-red in the revision) keeps its `done`/`completed_at`. Mirrors the
// same call in `approveTaskMap` (apps/web/src/lib/data/workflow.ts) — both
// call sites share the one pure helper so the optimistic local state and
// the eventually-synced Supabase row never disagree on the rule.
export function approveTaskMapLocal(
  state: WorkflowState,
  taskId: string,
  graph: { schema_version: string; nodes: unknown[]; edges: unknown[] },
): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return state;
  }

  const approvedAt = nowIso();

  let nextGraph = graph;
  if (task.map_status === "approved" && task.progression_map) {
    const previousValidation = validateTaskMapForPersistence(
      task.progression_map,
    );
    if (previousValidation.ok) {
      nextGraph = carryForwardNodeCompletion(
        previousValidation.graph as TaskMapGraph,
        graph as TaskMapGraph,
      ) as typeof graph;
    }
  }

  // FR-023 slice F4 (#678): first node == `first_tiny_step` (FR-023 criterion
  // 3). The local optimistic patch applies the SAME `resolveFirstStepNode`
  // derivation the Supabase approve (`approveTaskMap`) uses, so the two never
  // disagree; the e2e drives this path (no Supabase). A degenerate graph
  // (resolver returns null) leaves the existing `first_tiny_step` untouched.
  const firstStepNode = resolveFirstStepNode(nextGraph as TaskMapGraph);

  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            progression_map: nextGraph,
            map_status: "approved",
            map_schema_version: nextGraph.schema_version,
            map_approved_at: approvedAt,
            updated_at: approvedAt,
            ...(firstStepNode ? { first_tiny_step: firstStepNode.title } : {}),
          }
        : item,
    ),
  };
}

// FR-031 slice 6: local-first fold-back for a node-completion toggle,
// mirroring `approveTaskMapLocal` — a pure reducer patch so the UI reflects
// the tap immediately, independent of whether the best-effort Supabase
// persist (in WorkflowContext) succeeds. Guards its own inputs (unlike
// `approveTaskMapLocal`, which trusts an already-validated graph) because
// this is invoked directly from a UI tap rather than after an explicit
// approve-time validation step: a task with no approved map, an unknown
// node id, or a red node all safely no-op.
export function toggleTaskMapNodeCompletionLocal(
  state: WorkflowState,
  taskId: string,
  nodeId: string,
  nowIsoValue: string,
): WorkflowState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.map_status !== "approved" || !task.progression_map) {
    return state;
  }

  const validated = validateTaskMapForPersistence(task.progression_map);
  if (!validated.ok) {
    return state;
  }

  const currentGraph = validated.graph as TaskMapGraph;
  const updatedGraph = toggleNodeCompletion(currentGraph, nodeId, nowIsoValue);
  if (updatedGraph === currentGraph) {
    // Unknown node id or a red node — toggleNodeCompletion no-ops.
    return state;
  }

  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === taskId
        ? { ...item, progression_map: updatedGraph, updated_at: nowIsoValue }
        : item,
    ),
  };
}
