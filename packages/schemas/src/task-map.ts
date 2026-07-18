import { z } from "zod";

/**
 * FR-031 task-map AI draft validation.
 *
 * This schema enforces only draft shape and structural caps before persistence.
 * Graph semantics — cycle detection, edge referential integrity, red→required
 * edge rejection, one-level branching, and critical path — are enforced by the
 * slice-1 engine `validateGraph` in `apps/web/src/lib/taskmap/graph.ts`.
 * Any persistence path must run BOTH this schema and `validateGraph`.
 */

// FR-031 slice F2 (#664): additive schema evolution, same pattern as
// `META_LEARNING_EVENT_SCHEMA_VERSION`/`_V2` in `meta-learning.ts` — old
// persisted maps keep their exact version literal and validate unchanged;
// new drafts are generated (and re-approved regens are written) at the new
// version. Never a breaking replace: "1.0" documents (no node durations)
// must still parse and render.
export const TASK_MAP_SCHEMA_VERSION_V1 = "1.0" as const;
export const TASK_MAP_SCHEMA_VERSION_V1_1 = "1.1" as const;

const TaskMapSchemaVersionSchema = z.enum([
  TASK_MAP_SCHEMA_VERSION_V1,
  TASK_MAP_SCHEMA_VERSION_V1_1,
]);

// Mirrors `TaskMapNode` in `apps/web/src/lib/taskmap/graph.ts`; packages cannot
// import app code, so keep these field names assignment-compatible by design.
export const TaskMapNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    role: z.enum(["required", "optional", "red"]),
    done: z.boolean().optional(),
    // FR-031 slice 6: additive, optional, nullable ISO timestamp of the
    // user action that completed this node. Persisted-document-only — the
    // AI draft prompt contract (taskMapDraft.ts) intentionally does NOT gain
    // this field; the AI never emits completion state, only the user does
    // (via setTaskMapNodeCompletion / toggleNodeCompletion).
    completed_at: z.string().datetime().nullable().optional(),
    red_reason: z.string().min(1).optional(),
    red_condition: z.string().min(1).optional(),
    // FR-031 slice F2 (#664): additive, optional per-node duration estimate
    // in minutes, introduced at schema_version 1.1. Absent on every "1.0"
    // document and on any node the AI (or user) didn't estimate — absence
    // is not an error, it just means the deterministic roll-up
    // (`computeTaskMapTimeline` in `apps/web/src/lib/taskmap/timeline.ts`)
    // has no data for that node and flags the total as partial. Never
    // negative or zero: an unusable estimate is the same as no estimate.
    estimated_minutes: z.number().positive().optional(),
  })
  .strict();

// Mirrors `TaskMapEdge` in `apps/web/src/lib/taskmap/graph.ts`; packages cannot
// import app code, so keep these field names assignment-compatible by design.
export const TaskMapEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();

export const TaskMapGraphDraftSchema = z
  .object({
    schema_version: TaskMapSchemaVersionSchema,
    nodes: z.array(TaskMapNodeSchema).min(1).max(13),
    edges: z.array(TaskMapEdgeSchema),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const requiredCount = graph.nodes.filter(
      (node) => node.role === "required",
    ).length;
    const optionalCount = graph.nodes.filter(
      (node) => node.role === "optional",
    ).length;
    const redCount = graph.nodes.filter((node) => node.role === "red").length;

    if (requiredCount > 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task maps may include at most 7 required nodes.",
        path: ["nodes"],
      });
    }

    if (optionalCount > 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task maps may include at most 4 optional nodes.",
        path: ["nodes"],
      });
    }

    if (redCount > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task maps may include at most 2 red nodes.",
        path: ["nodes"],
      });
    }

    graph.nodes.forEach((node, index) => {
      if (node.role === "red" && !node.red_reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Red nodes must include a non-empty red_reason.",
          path: ["nodes", index, "red_reason"],
        });
      }
    });

    const seenNodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (seenNodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Task map node ids must be unique.",
          path: ["nodes", index, "id"],
        });
      }
      seenNodeIds.add(node.id);
    });
  });

export type TaskMapNodeDraft = z.infer<typeof TaskMapNodeSchema>;
export type TaskMapEdgeDraft = z.infer<typeof TaskMapEdgeSchema>;
export type TaskMapGraphDraft = z.infer<typeof TaskMapGraphDraftSchema>;
