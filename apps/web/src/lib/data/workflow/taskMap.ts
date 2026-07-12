import type { Task } from "@lifeos/schemas";
import { validateTaskMapForPersistence } from "../../taskmap/persistence";
import {
  carryForwardNodeCompletion,
  toggleNodeCompletion,
} from "../../taskmap/collapse";
import type { TaskMapGraph } from "../../taskmap/graph";
import {
  type DataProvider,
  type MinimalSupabaseClient,
  getSupabaseMessage,
  logLearningWriteFailure,
  parseTask,
  requireSupabaseUser,
  taskColumns,
} from "./shared";
import {
  createSuggestionRecord,
  recordOverrideFireAndForget,
  uuidPattern,
} from "./metaLearning";

// FR-031 slice 4: task-map v1 AI graph draft, born instrumented per NS-INV-3.
export const TASK_MAP_DRAFT_POLICY_ID = "task_map.v1" as const;

export interface TaskMapDraftSuggestionNodeCounts {
  required: number;
  optional: number;
  red: number;
}

export interface TaskMapDraftSuggestionInput {
  area_id: string | null;
  task_id: string;
  node_counts: TaskMapDraftSuggestionNodeCounts;
  node_titles: string[];
  confidence?: number | null;
  /** FR-031 slice 8 — "initial" for the first draft on a task, "regen" for
   * an explicit user-requested revision of an already-approved map.
   * Defaults to "initial" for callers that predate slice 8. */
  generated_from?: "initial" | "regen";
}

export interface TaskMapDraftSuggestionResult {
  provider: DataProvider;
  suggestionId: string | null;
}

/**
 * Instrument a generated task-map draft at birth (NS-INV-3): one pending
 * suggestion_records row per generation. Unlike the other recorders in this
 * file, this one is awaited (with full error containment, never throwing) —
 * the caller (the one-pass approve path) needs the row id back to resolve it
 * later, so a truly detached fire-and-forget write would lose that id. A
 * write failure still never breaks the generation response: it degrades to a
 * null suggestionId, and the draft is returned to the caller either way.
 */
export async function recordTaskMapDraftSuggestion(
  client: MinimalSupabaseClient | null,
  input: TaskMapDraftSuggestionInput,
): Promise<TaskMapDraftSuggestionResult> {
  try {
    const result = await createSuggestionRecord(client, {
      area_id: input.area_id,
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      suggestion_type: "task_map_draft",
      subject_type: "task",
      subject_id: uuidPattern.test(input.task_id) ? input.task_id : null,
      suggestion_json: {
        node_counts: input.node_counts,
        node_titles: input.node_titles,
        generated_from: input.generated_from ?? "initial",
      },
      confidence: input.confidence ?? null,
      status: "pending",
    });

    const record = result.record as { id?: string } | null;
    return { provider: result.provider, suggestionId: record?.id ?? null };
  } catch (error) {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      suggestion_type: "task_map_draft",
    });
    return { provider: client ? "supabase" : "mock", suggestionId: null };
  }
}

interface SuggestionResolutionInput {
  id: string;
  status: "accepted" | "rejected";
  decided_by: "user" | "system";
  resolved_at: string;
}

async function updateSuggestionRecordStatus(
  client: MinimalSupabaseClient,
  input: SuggestionResolutionInput,
): Promise<void> {
  const query = client.from("suggestion_records") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };

  const { error } = await query
    .update({
      status: input.status,
      decided_by: input.decided_by,
      resolved_at: input.resolved_at,
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }
}

function recordSuggestionResolutionFireAndForget(
  client: MinimalSupabaseClient,
  input: SuggestionResolutionInput,
): void {
  void updateSuggestionRecordStatus(client, input).catch((error) => {
    logLearningWriteFailure(error, {
      table: "suggestion_records",
      policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
      action: "resolve",
    });
  });
}

interface TaskMapNodeLike {
  id: string;
  title: string;
  role: "required" | "optional" | "red";
  red_reason?: string;
  red_condition?: string;
}

type TaskMapNodeDiff =
  | {
      override_type: "node_removed";
      old_value: TaskMapNodeLike;
      new_value: null;
    }
  | { override_type: "node_added"; old_value: null; new_value: TaskMapNodeLike }
  | {
      override_type: "node_edited";
      old_value: TaskMapNodeLike;
      new_value: TaskMapNodeLike;
    };

/**
 * Diffs the AI draft's nodes against the (possibly user-edited) approved
 * graph's nodes, keyed by node id. Unchanged nodes produce no diff entry —
 * only actual removals/edits/additions are instrumented, per NS-INV-3.
 */
function diffTaskMapNodes(
  aiNodes: TaskMapNodeLike[],
  approvedNodes: TaskMapNodeLike[],
): TaskMapNodeDiff[] {
  const aiById = new Map(aiNodes.map((node) => [node.id, node]));
  const approvedById = new Map(approvedNodes.map((node) => [node.id, node]));
  const diffs: TaskMapNodeDiff[] = [];

  for (const node of aiNodes) {
    if (!approvedById.has(node.id)) {
      diffs.push({
        override_type: "node_removed",
        old_value: node,
        new_value: null,
      });
    }
  }

  for (const node of approvedNodes) {
    const aiNode = aiById.get(node.id);
    if (!aiNode) {
      diffs.push({
        override_type: "node_added",
        old_value: null,
        new_value: node,
      });
      continue;
    }

    const changed =
      aiNode.title !== node.title ||
      aiNode.role !== node.role ||
      (aiNode.red_reason ?? null) !== (node.red_reason ?? null) ||
      (aiNode.red_condition ?? null) !== (node.red_condition ?? null);

    if (changed) {
      diffs.push({
        override_type: "node_edited",
        old_value: aiNode,
        new_value: node,
      });
    }
  }

  return diffs;
}

export interface ApproveTaskMapAiDraft {
  nodes: TaskMapNodeLike[];
  edges: { from: string; to: string }[];
}

export interface ApproveTaskMapInput {
  task_id: string;
  area_id: string | null;
  /** The (possibly user-edited) graph to persist; validated before write. */
  graph: unknown;
  /** The original AI draft, kept for override diffing. Null when the map was
   * hand-built with no AI draft to diff against (no diffs are recorded). */
  ai_draft: ApproveTaskMapAiDraft | null;
  /** The pending suggestion_records row from generation, if one exists. */
  suggestion_record_id?: string | null;
  /** FR-031 slice 8 — the previously approved graph, when this approval is
   * a regen revision of an already-approved map. Null/omitted for a
   * first-time approve. Used ONLY to carry `completed_at`/`done` forward
   * for surviving node ids (`carryForwardNodeCompletion`); it plays no
   * part in override diffing (that stays `ai_draft` vs. the persisted
   * graph, per slice 4). An unparseable `previous_graph` degrades to no
   * carry-forward rather than blocking the approve. */
  previous_graph?: unknown | null;
}

export interface TaskMapApproveResult {
  provider: DataProvider;
  task: Task;
}

/**
 * FR-031 slice 4 one-pass approve path (NS-INV-4: no AI-drafted map persists
 * without approval). Runs `validateTaskMapForPersistence` — schema AND graph
 * validation — before ever touching `tasks.progression_map`; rejects on
 * failure instead of writing anything. Every successful approval here
 * writes `map_status: "approved"` directly — `superseded` stays reserved.
 * Scope decision (slice 8): `tasks.progression_map` is a single jsonb
 * column, one map per task, so an approved revision overwrites the prior
 * content rather than modeling row-level map history; `superseded` has no
 * row to apply to in v1 and is not invented one here (no new tables — that
 * is v2 territory). The prior content is not lost: it lives in the
 * `suggestion_records`/`override_records` instrumentation trail from its
 * own approval, just not as a live "superseded map" row.
 *
 * FR-031 slice 8: when `input.previous_graph` is supplied (a regen
 * revision), `carryForwardNodeCompletion` runs on the validated graph
 * before it is written, so a completed node that survives the revision
 * (same id, non-red in the new graph) keeps its `done`/`completed_at`.
 */
export async function approveTaskMap(
  client: MinimalSupabaseClient | null,
  input: ApproveTaskMapInput,
): Promise<TaskMapApproveResult> {
  const validation = validateTaskMapForPersistence(input.graph);
  if (!validation.ok) {
    throw new Error(
      `Task map failed validation and was not saved: ${validation.errors.join("; ")}`,
    );
  }

  let graph = validation.graph;
  if (input.previous_graph) {
    const previousValidation = validateTaskMapForPersistence(
      input.previous_graph,
    );
    if (previousValidation.ok) {
      graph = carryForwardNodeCompletion(
        previousValidation.graph as TaskMapGraph,
        graph as TaskMapGraph,
      ) as typeof graph;
    }
    // An unparseable previous_graph degrades to no carry-forward rather
    // than blocking the approve — the same NFR-004 posture as every other
    // task-map degrade path in this file.
  }

  if (!client) {
    throw new Error("Mock task-map approval uses the local workflow context.");
  }

  await requireSupabaseUser(client, "Sign in before approving task maps.");

  const approvedAt = new Date().toISOString();
  const query = client.from("tasks") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({
      progression_map: graph,
      map_status: "approved",
      map_schema_version: graph.schema_version,
      map_approved_at: approvedAt,
    })
    .eq("id", input.task_id)
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  const task = parseTask(data);

  if (input.suggestion_record_id) {
    recordSuggestionResolutionFireAndForget(client, {
      id: input.suggestion_record_id,
      status: "accepted",
      decided_by: "user",
      resolved_at: approvedAt,
    });
  }

  if (input.ai_draft) {
    const diffs = diffTaskMapNodes(input.ai_draft.nodes, graph.nodes);
    for (const diff of diffs) {
      recordOverrideFireAndForget(client, {
        area_id: input.area_id,
        policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
        suggestion_id: input.suggestion_record_id ?? null,
        subject_type: "task_map_node",
        subject_id: task.id,
        override_type: diff.override_type,
        old_value_json: diff.old_value ?? {},
        new_value_json: diff.new_value ?? {},
        reason: null,
      });
    }
  }

  return { provider: "supabase", task };
}

export interface SetTaskMapNodeCompletionInput {
  task_id: string;
  node_id: string;
  /** The current approved graph (pre-toggle), as already loaded by the
   * caller (WorkflowContext holds the persisted task's `progression_map` in
   * local state). Re-validated here before any mutation is computed or
   * written — this function is the sole choke point for a completion write,
   * mirroring `approveTaskMap`. */
  graph: unknown;
  /** ISO timestamp of the user action, supplied by the caller so the write
   * is deterministic and testable (no ambient `Date.now`). */
  now: string;
}

export interface TaskMapNodeCompletionResult {
  provider: DataProvider;
  task: Task;
}

/**
 * FR-031 slice 6 — user-action-only node completion on an already-approved
 * map. Never AI-invoked, never instrumented (a completion tap is not an AI
 * suggestion resolution, so no suggestion_records/override_records write
 * happens here). Gate-first: the incoming graph is validated with
 * `validateTaskMapForPersistence` before the pure `toggleNodeCompletion`
 * (apps/web/src/lib/taskmap/collapse.ts) computes the mutated graph, which
 * is re-validated before it ever reaches `tasks.progression_map`. Red nodes
 * and unknown node ids are rejected (`toggleNodeCompletion` no-ops and this
 * function throws instead of writing silently).
 */
export async function setTaskMapNodeCompletion(
  client: MinimalSupabaseClient | null,
  input: SetTaskMapNodeCompletionInput,
): Promise<TaskMapNodeCompletionResult> {
  const validation = validateTaskMapForPersistence(input.graph);
  if (!validation.ok) {
    throw new Error(
      `Task map failed validation and completion was not saved: ${validation.errors.join("; ")}`,
    );
  }

  const currentNode = validation.graph.nodes.find(
    (node) => node.id === input.node_id,
  );
  if (!currentNode) {
    throw new Error(`Task map node not found: ${input.node_id}`);
  }
  if (currentNode.role === "red") {
    throw new Error("Red task-map nodes cannot be marked done.");
  }

  const updatedGraph = toggleNodeCompletion(
    validation.graph as TaskMapGraph,
    input.node_id,
    input.now,
  );

  const revalidation = validateTaskMapForPersistence(updatedGraph);
  if (!revalidation.ok) {
    throw new Error(
      `Task map completion failed validation and was not saved: ${revalidation.errors.join("; ")}`,
    );
  }

  if (!client) {
    throw new Error(
      "Mock task-map completion uses the local workflow context.",
    );
  }

  await requireSupabaseUser(client, "Sign in before updating task maps.");

  const query = client.from("tasks") as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };

  const { data, error } = await query
    .update({ progression_map: revalidation.graph })
    .eq("id", input.task_id)
    .select(taskColumns)
    .single();

  if (error) {
    throw new Error(getSupabaseMessage(error));
  }

  return { provider: "supabase", task: parseTask(data) };
}
