import {
  TaskMapGraphDraftSchema,
  type TaskMapGraphDraft,
} from "@lifeos/schemas";

import { validateGraph, type TaskMapGraph } from "./graph";

/**
 * FR-031 slice 3 persistence gate. The header comment on
 * `TaskMapGraphDraftSchema` (packages/schemas/src/task-map.ts) mandates that
 * any persistence path run BOTH the draft schema and `validateGraph`
 * (apps/web/src/lib/taskmap/graph.ts) before a task-map graph is written to
 * `tasks.progression_map`. This module IS that choke point — no other code
 * path should write `progression_map` without going through here first.
 */

export type TaskMapPersistenceResult =
  | { ok: true; graph: TaskMapGraphDraft }
  | { ok: false; errors: string[] };

export function validateTaskMapForPersistence(
  input: unknown,
): TaskMapPersistenceResult {
  const schemaResult = TaskMapGraphDraftSchema.safeParse(input);

  if (!schemaResult.success) {
    return {
      ok: false,
      errors: schemaResult.error.issues.map(
        (issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`,
      ),
    };
  }

  const graph = schemaResult.data;
  const graphResult = validateGraph(graph as TaskMapGraph);

  if (!graphResult.valid) {
    return { ok: false, errors: graphResult.errors };
  }

  return { ok: true, graph };
}
