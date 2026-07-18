// WorkflowContext domain module — task-map draft actions.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior/dependency-array changes). Unlike the other
// domain modules, this one WAS a contiguous run of `useCallback` hooks in the
// provider body (requestTaskMapDraftAction, dismissTaskMapDraftAction,
// approveTaskMapDraftAction, toggleTaskMapNodeCompletionAction). Wrapping a
// contiguous hook run in one custom hook preserves the flattened hook-call
// order exactly (React only tracks the total per-render hook sequence, not
// which function each call is textually nested in), so this is called from
// WorkflowProvider at the same relative position the four useCallbacks used
// to occupy, unconditionally, every render.
import { useCallback, type Dispatch, type MutableRefObject } from "react";
import type { Area } from "@lifeos/schemas";
import { requestTaskMapDraft as fetchTaskMapDraft } from "../ai/taskMapDraftClient";
import { validateTaskMapForPersistence } from "../taskmap/persistence";
import type { TaskMapGraph } from "../taskmap/graph";
import { approveTaskMap, setTaskMapNodeCompletion } from "../data/workflow";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type { WorkflowState } from "../workflow";
import {
  persistedAreaIdForWorkflowId,
  persistedIdForLocalId,
} from "./reducerCore";
import type { WorkflowAction } from "./reducerCore";
import type { MinimalSupabaseClient } from "../data/workflow";
import { SAFE_TASK_MAP_FAILURE_MESSAGE, type TaskMapDraftState } from "./types";

export interface TaskMapDraftActionsDeps {
  dispatch: Dispatch<WorkflowAction>;
  taskMapDraftRef: MutableRefObject<TaskMapDraftState>;
  setTaskMapDraft: (next: TaskMapDraftState) => void;
  stateRef: MutableRefObject<WorkflowState>;
  persistedAreasRef: MutableRefObject<Area[]>;
  persistedTaskIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  markLocalOnly: (message: string) => void;
  syncPersistedWorkflowRows: (
    client: MinimalSupabaseClient | null,
  ) => Promise<void>;
}

export function useTaskMapDraftActions(deps: TaskMapDraftActionsDeps) {
  const {
    dispatch,
    taskMapDraftRef,
    setTaskMapDraft,
    stateRef,
    persistedAreasRef,
    persistedTaskIdByLocalIdRef,
    markLocalOnly,
    syncPersistedWorkflowRows,
  } = deps;

  // #590 slice 4: these dep arrays are copied verbatim from the original
  // inline useCallback hooks in WorkflowContext.tsx (mechanical extraction —
  // no dependency-array changes allowed). eslint's exhaustive-deps can no
  // longer statically prove `dispatch`/refs/`setTaskMapDraft` are
  // React-stable once they arrive via a destructured `deps` parameter
  // instead of a direct `useRef`/`useState`/`useReducer` call in this
  // function — they still are (refs never change identity across renders,
  // `dispatch` from `useReducer` and `setState` setters are stable by React
  // contract), so the warnings below are suppressed rather than the deps
  // arrays widened.

  // FR-031 slice 5: on-demand task-map draft generation (NFR-001/NFR-005 —
  // only ever called from an explicit user action, never a background
  // effect). Keyed to `taskId` so a stale draft from a previously focused
  // task never renders against the wrong task.
  const requestTaskMapDraftAction = useCallback(async (taskId: string) => {
    const task = stateRef.current.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const setDraft = (next: TaskMapDraftState) => {
      taskMapDraftRef.current = next;
      setTaskMapDraft(next);
    };

    setDraft({ phase: "pending", taskId });

    // Best-effort bearer token; the route requires one and 401s (as an
    // ordinary ok:false) without it, so a missing/expired session degrades
    // to the usual failed-draft notice rather than throwing.
    let authorization: string | undefined;
    try {
      const authClient = createSupabaseBrowserClient();
      if (authClient) {
        const { data } = await authClient.auth.getSession();
        const accessToken = data.session?.access_token?.trim();
        if (accessToken) {
          authorization = `Bearer ${accessToken}`;
        }
      }
    } catch {
      // Tracing/auth is best-effort; fall through to an unauthenticated call.
    }

    const persistedAreaId = task.area_id
      ? persistedAreaIdForWorkflowId(task.area_id, persistedAreasRef.current)
      : null;

    // FR-031 slice 8: an already-approved map turns this generation call
    // into a regeneration — send the current map (nodes/edges/completion)
    // as data alongside the request so the prompt can offer it as context
    // (contextAssembly.ts). The client already holds the approved graph
    // locally; no extra read is needed.
    let currentMap: NonNullable<
      Parameters<typeof fetchTaskMapDraft>[0]["currentMap"]
    > | null = null;
    if (task.map_status === "approved" && task.progression_map) {
      const validatedCurrent = validateTaskMapForPersistence(
        task.progression_map,
      );
      if (validatedCurrent.ok) {
        currentMap = {
          nodes: validatedCurrent.graph.nodes.map((node) => ({
            id: node.id,
            title: node.title,
            role: node.role,
            done: node.done === true || Boolean(node.completed_at),
            red_reason: node.red_reason ?? null,
            red_condition: node.red_condition ?? null,
          })),
          edges: validatedCurrent.graph.edges.map((edge) => ({
            from: edge.from,
            to: edge.to,
          })),
        };
      }
    }

    const result = await fetchTaskMapDraft({
      taskId,
      areaId: persistedAreaId,
      title: task.title,
      description: task.description ?? null,
      definitionOfDone: task.definition_of_done ?? null,
      firstTinyStep: task.first_tiny_step ?? null,
      authorization,
      currentMap,
    });

    // Ignore a stale response if the focused task changed mid-flight.
    if (
      taskMapDraftRef.current.phase !== "pending" ||
      taskMapDraftRef.current.taskId !== taskId
    ) {
      return;
    }

    if (!result.ok) {
      setDraft({
        phase: "failed",
        taskId,
        message: SAFE_TASK_MAP_FAILURE_MESSAGE,
      });
      return;
    }

    setDraft({
      phase: "ready",
      taskId,
      draft: result.draft,
      suggestionRecordId: result.suggestionRecordId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above the `deps` destructure
  }, []);

  const dismissTaskMapDraftAction = useCallback(() => {
    taskMapDraftRef.current = { phase: "idle" };
    setTaskMapDraft({ phase: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, []);

  // FR-031 slice 5 one-pass approve (ADR 0002 D1). The local reducer patch
  // flips the UI from the v0 rail to `TaskMapView` immediately; Supabase
  // persistence (via `approveTaskMap`, which re-validates before writing)
  // is best-effort, mirroring `confirmWin`/`confirmRollup`'s markLocalOnly
  // fallback — a sync failure never loses the owner's approval decision.
  const approveTaskMapDraftAction = useCallback(
    async (
      taskId: string,
      graph: TaskMapGraph & { schema_version: "1.0" | "1.1" },
    ) => {
      const validated = validateTaskMapForPersistence(graph);
      if (!validated.ok) {
        markLocalOnly("Map couldn't be saved as edited; nothing changed.");
        return;
      }
      const validatedGraph = validated.graph as TaskMapGraph & {
        schema_version: string;
      };

      const priorDraft = taskMapDraftRef.current;
      const aiDraftSource =
        priorDraft.phase === "ready" && priorDraft.taskId === taskId
          ? priorDraft
          : null;

      dispatch({
        type: "approveTaskMapLocal",
        taskId,
        graph: validatedGraph,
      });
      taskMapDraftRef.current = { phase: "idle" };
      setTaskMapDraft({ phase: "idle" });

      const client = createSupabaseBrowserClient();
      const persistedTaskId = persistedIdForLocalId(
        taskId,
        persistedTaskIdByLocalIdRef.current,
      );

      if (!client || !persistedTaskId) {
        markLocalOnly("Map approved locally; account sync is pending.");
        return;
      }

      const task = stateRef.current.tasks.find((item) => item.id === taskId);
      const persistedAreaId = task?.area_id
        ? persistedAreaIdForWorkflowId(task.area_id, persistedAreasRef.current)
        : null;

      // FR-031 slice 8: `stateRef.current` lags a render behind (it's
      // synced from `state` in an effect, line ~1237), so right after the
      // `approveTaskMapLocal` dispatch above it still holds the PRE-dispatch
      // task — exactly the prior approved map (if any) that
      // `approveTaskMapLocal` itself carried completion forward from. Send
      // it here too so the Supabase-persisted row applies the identical
      // carry-forward rule (`carryForwardNodeCompletion`, shared helper).
      const previousGraph =
        task?.map_status === "approved" && task.progression_map
          ? task.progression_map
          : null;

      try {
        await approveTaskMap(client, {
          task_id: persistedTaskId,
          area_id: persistedAreaId,
          graph: validatedGraph,
          ai_draft: aiDraftSource
            ? {
                nodes: aiDraftSource.draft.nodes,
                edges: aiDraftSource.draft.edges,
              }
            : null,
          suggestion_record_id: aiDraftSource?.suggestionRecordId ?? null,
          previous_graph: previousGraph,
        });
        await syncPersistedWorkflowRows(client);
      } catch {
        markLocalOnly("Map approved locally; account sync is pending.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above the `deps` destructure
    [markLocalOnly, syncPersistedWorkflowRows],
  );

  // FR-031 slice 6 — reversible node-completion toggle on an approved map.
  // Same local-first pattern as `approveTaskMapDraftAction`: the reducer
  // patch flips the UI immediately (and safely no-ops for a red/unknown
  // node or a task with no approved map — `toggleTaskMapNodeCompletionLocal`
  // guards all of that), and the Supabase persist is best-effort with the
  // same markLocalOnly fallback.
  const toggleTaskMapNodeCompletionAction = useCallback(
    async (taskId: string, nodeId: string) => {
      const nowIso = new Date().toISOString();

      dispatch({
        type: "toggleTaskMapNodeCompletionLocal",
        taskId,
        nodeId,
        nowIso,
      });

      const client = createSupabaseBrowserClient();
      const persistedTaskId = persistedIdForLocalId(
        taskId,
        persistedTaskIdByLocalIdRef.current,
      );

      if (!client || !persistedTaskId) {
        markLocalOnly("Completion saved locally; account sync is pending.");
        return;
      }

      const task = stateRef.current.tasks.find((item) => item.id === taskId);
      if (!task?.progression_map) {
        return;
      }

      try {
        await setTaskMapNodeCompletion(client, {
          task_id: persistedTaskId,
          node_id: nodeId,
          graph: task.progression_map,
          now: nowIso,
        });
        await syncPersistedWorkflowRows(client);
      } catch {
        markLocalOnly("Completion saved locally; account sync is pending.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above the `deps` destructure
    [markLocalOnly, syncPersistedWorkflowRows],
  );

  return {
    requestTaskMapDraftAction,
    dismissTaskMapDraftAction,
    approveTaskMapDraftAction,
    toggleTaskMapNodeCompletionAction,
  };
}

export type TaskMapDraftActions = ReturnType<typeof useTaskMapDraftActions>;
