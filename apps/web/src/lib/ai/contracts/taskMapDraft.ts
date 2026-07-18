import {
  TaskMapGraphDraftSchema,
  type TaskMapGraphDraft,
} from "@lifeos/schemas";

/**
 * FR-031 slice 4 — AI contract for the task-map graph draft.
 *
 * Mirrors the house pattern in `contracts/parseCapture.ts`: a strict JSON
 * schema (additionalProperties: false) for the structured-output request,
 * plus a validator that re-checks the provider's JSON against the zod schema
 * that is also the persistence gate (`TaskMapGraphDraftSchema`,
 * packages/schemas/src/task-map.ts).
 *
 * The AI drafts the candidate graph ONLY. No field here may set or imply
 * criticality — there is no `on_critical_path`/`critical` property anywhere
 * in this schema. Critical-path highlighting is computed deterministically in
 * code by `computeCriticalPath` (apps/web/src/lib/taskmap/graph.ts) from the
 * approved graph; the AI never determines, edits, or re-scores it.
 */

// FR-031 slice F2 (#664): freshly generated drafts are emitted at 1.1 (nodes
// may carry an AI-proposed `estimated_minutes`, approved like any other draft
// field). Persisted 1.0 maps stay valid — the zod gate accepts both versions.
export const TASK_MAP_DRAFT_SCHEMA_VERSION = "1.1" as const;

type JsonSchema = Record<string, unknown>;

const taskMapNodeJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    role: { type: "string", enum: ["required", "optional", "red"] },
    red_reason: { type: ["string", "null"] },
    red_condition: { type: ["string", "null"] },
    // FR-031 slice F2 (#664): AI-proposed duration estimate in whole
    // minutes, or null when the AI cannot estimate a step. Draft-only input
    // to the deterministic roll-up (timeline.ts) — never a timeline claim.
    estimated_minutes: { type: ["number", "null"] },
  },
  required: [
    "id",
    "title",
    "role",
    "red_reason",
    "red_condition",
    "estimated_minutes",
  ],
};

const taskMapEdgeJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string" },
    to: { type: "string" },
  },
  required: ["from", "to"],
};

export const taskMapDraftResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schema_version: {
      type: "string",
      enum: [TASK_MAP_DRAFT_SCHEMA_VERSION],
    },
    nodes: { type: "array", items: taskMapNodeJsonSchema },
    edges: { type: "array", items: taskMapEdgeJsonSchema },
  },
  required: ["schema_version", "nodes", "edges"],
};

export const taskMapDraftResponseFormat = {
  type: "json_schema",
  name: "task_map_draft_response",
  description:
    "A candidate DAG progression map (nodes + edges) drafted for one task.",
  strict: true,
  schema: taskMapDraftResponseJsonSchema,
} as const;

/**
 * Validates raw provider JSON against the shape contract only (schema_version
 * + node/edge field shape + the per-role caps already enforced by
 * `TaskMapGraphDraftSchema`). This is NOT the persistence gate: any path that
 * writes `tasks.progression_map` must additionally run
 * `validateTaskMapForPersistence` (apps/web/src/lib/taskmap/persistence.ts),
 * which also runs `validateGraph` (cycles, edge referential integrity,
 * red-to-required rejection, one-level branching).
 */
export function validateTaskMapDraftResponse(
  payload: unknown,
): TaskMapGraphDraft {
  // The strict json_schema `red_reason`/`red_condition` properties are typed
  // ["string","null"] for provider structured-output compatibility (every
  // property must be `required`); normalize null back to undefined before the
  // zod parse, which models both fields as optional.
  const normalized = normalizeNullableOptionalFields(payload);

  const result = TaskMapGraphDraftSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(
      `Task map draft response failed validation: ${result.error.message}`,
    );
  }

  return result.data;
}

function normalizeNullableOptionalFields(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.nodes)) {
    return payload;
  }

  return {
    ...record,
    nodes: record.nodes.map((node) => {
      if (!node || typeof node !== "object") {
        return node;
      }
      const nodeRecord = node as Record<string, unknown>;
      const normalizedNode = { ...nodeRecord };
      if (normalizedNode.red_reason === null) {
        delete normalizedNode.red_reason;
      }
      if (normalizedNode.red_condition === null) {
        delete normalizedNode.red_condition;
      }
      // FR-031 slice F2: null means "no estimate" (the strict json_schema
      // requires the property); an unusable number (zero/negative/NaN)
      // degrades to no estimate as well rather than failing the whole
      // draft — the roll-up flags such nodes as partial instead.
      if (
        normalizedNode.estimated_minutes === null ||
        (typeof normalizedNode.estimated_minutes === "number" &&
          (!Number.isFinite(normalizedNode.estimated_minutes) ||
            normalizedNode.estimated_minutes <= 0))
      ) {
        delete normalizedNode.estimated_minutes;
      }
      return normalizedNode;
    }),
  };
}
