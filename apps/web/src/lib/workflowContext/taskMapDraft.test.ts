import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch } from "react";
import {
  acceptLatestDraft,
  captureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import type { TaskMapDraftRequestResult } from "../ai/taskMapDraftClient";
import { workflowReducer, type WorkflowAction } from "./reducerCore";
import type { TaskMapDraftState } from "./types";
import { useTaskMapDraftActions } from "./taskMapDraft";

const requestTaskMapDraftMock = vi.hoisted(() => vi.fn());
const approveTaskMapMock = vi.hoisted(() => vi.fn());
const createSupabaseBrowserClientMock = vi.hoisted(() => vi.fn());

vi.mock("../ai/taskMapDraftClient", () => ({
  requestTaskMapDraft: requestTaskMapDraftMock,
}));

vi.mock("../data/workflow", () => ({
  approveTaskMap: approveTaskMapMock,
  rejectTaskMapSuggestionFireAndForget: vi.fn(),
  setTaskMapNodeCompletion: vi.fn(),
}));

vi.mock("../supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock,
}));

const PERSISTED_TASK_ID = "22222222-2222-4222-8222-222222222222";

const DRAFT = {
  schema_version: "1.0" as const,
  nodes: [
    { id: "first", title: "Open the document", role: "required" as const },
  ],
  edges: [],
};

function aliasKnownLocalTaskState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Finish the synthetic report.");
  state = acceptLatestDraft(state);
  const localTask = state.tasks.at(-1);
  if (!localTask) throw new Error("No accepted task was reachable.");
  const next = workflowReducer(state, {
    type: "recordAccountId",
    family: "tasks",
    localId: localTask.id,
    accountId: PERSISTED_TASK_ID,
  });
  return { state: next, localTaskId: localTask.id };
}

function retiredLocalTaskState() {
  const { state, localTaskId } = aliasKnownLocalTaskState();
  const localTask = state.tasks.find((task) => task.id === localTaskId);
  if (!localTask)
    throw new Error("The local task was not retained before sync.");
  const next = workflowReducer(state, {
    type: "syncPersistedWorkflow",
    payload: {
      captures: [],
      tasks: [{ ...localTask, id: PERSISTED_TASK_ID }],
      proposals: [],
      blocks: [],
      sessions: [],
      reviewLog: [],
      idAliases: {
        captures: new Map(),
        tasks: new Map(),
        proposals: new Map(),
        blocks: new Map(),
        sessions: new Map(),
      },
    },
  });
  return { state: next, localTaskId };
}

function taskAliasRef(state: ReturnType<typeof workflowSeed>) {
  return {
    current: new Map(Object.entries(state.accountIdByLocalId.tasks)),
  };
}

describe("useTaskMapDraftActions (#687)", () => {
  beforeEach(() => {
    requestTaskMapDraftMock.mockReset();
    approveTaskMapMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    createSupabaseBrowserClientMock.mockReturnValue(null);
  });

  it("starts and completes the offered local task's map after account reconciliation retired that local row", async () => {
    let resolveRequest: (result: TaskMapDraftRequestResult) => void;
    requestTaskMapDraftMock.mockImplementation(
      () =>
        new Promise<TaskMapDraftRequestResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const retired = retiredLocalTaskState();
    const stateRef = { current: retired.state };
    const { localTaskId } = retired;
    const setTaskMapDraft = vi.fn();

    expect(stateRef.current.tasks.map((task) => task.id)).toEqual([
      PERSISTED_TASK_ID,
    ]);
    expect(stateRef.current.tasks.some((task) => task.id === localTaskId)).toBe(
      false,
    );

    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft,
        stateRef,
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(stateRef.current),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestTaskMapDraftAction(localTaskId);
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "pending",
      taskId: localTaskId,
    });
    expect(requestTaskMapDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: PERSISTED_TASK_ID,
        title: stateRef.current.tasks[0]?.title,
      }),
    );

    await act(async () => {
      resolveRequest!({ ok: true, draft: DRAFT, suggestionRecordId: null });
      await request!;
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "ready",
      taskId: localTaskId,
      draft: DRAFT,
      suggestionRecordId: null,
    });
  });

  it("starts and completes the canonical account task as the fixture control", async () => {
    let resolveRequest: (result: TaskMapDraftRequestResult) => void;
    requestTaskMapDraftMock.mockImplementation(
      () =>
        new Promise<TaskMapDraftRequestResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const retired = retiredLocalTaskState();
    const stateRef = { current: retired.state };

    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef,
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(stateRef.current),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestTaskMapDraftAction(PERSISTED_TASK_ID);
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "pending",
      taskId: PERSISTED_TASK_ID,
    });
    expect(requestTaskMapDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: PERSISTED_TASK_ID }),
    );

    await act(async () => {
      resolveRequest!({ ok: true, draft: DRAFT, suggestionRecordId: null });
      await request!;
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "ready",
      taskId: PERSISTED_TASK_ID,
      draft: DRAFT,
      suggestionRecordId: null,
    });
  });

  it("uses the alias for the request while the local row still owns state", async () => {
    requestTaskMapDraftMock.mockResolvedValue({
      ok: false,
      error: "safe",
      degrade: "breakdown_rail",
    });
    const local = aliasKnownLocalTaskState();
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: local.state },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(local.state),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await act(async () => {
      await result.current.requestTaskMapDraftAction(local.localTaskId);
    });

    expect(requestTaskMapDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: PERSISTED_TASK_ID }),
    );
    expect(taskMapDraftRef.current).toEqual({
      phase: "failed",
      taskId: local.localTaskId,
      message: "Couldn't draft a map right now. Staying on the step list.",
    });
  });

  it("ignores a resolved alias request when a later offered task owns the draft state", async () => {
    let resolveRequest: (result: TaskMapDraftRequestResult) => void;
    requestTaskMapDraftMock.mockImplementation(
      () =>
        new Promise<TaskMapDraftRequestResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const retired = retiredLocalTaskState();
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const setTaskMapDraft = vi.fn();
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft,
        stateRef: { current: retired.state },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(retired.state),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestTaskMapDraftAction(retired.localTaskId);
    });
    taskMapDraftRef.current = { phase: "pending", taskId: "task-later" };

    await act(async () => {
      resolveRequest!({ ok: true, draft: DRAFT, suggestionRecordId: null });
      await request!;
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "pending",
      taskId: "task-later",
    });
    expect(setTaskMapDraft).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "ready" }),
    );
  });

  it("approves an offered local draft against its canonical state and persisted task", async () => {
    const client = {};
    const dispatch = vi.fn();
    const syncPersistedWorkflowRows = vi.fn().mockResolvedValue(undefined);
    const retired = retiredLocalTaskState();
    createSupabaseBrowserClientMock.mockReturnValue(client);
    approveTaskMapMock.mockResolvedValue(undefined);
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: {
        phase: "ready",
        taskId: retired.localTaskId,
        draft: DRAFT,
        suggestionRecordId: "suggestion-1",
      },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: dispatch as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: retired.state },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(retired.state),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows,
      }),
    );

    await act(async () => {
      await result.current.approveTaskMapDraftAction(
        retired.localTaskId,
        DRAFT,
      );
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "approveTaskMapLocal",
      taskId: PERSISTED_TASK_ID,
      graph: DRAFT,
    });
    expect(approveTaskMapMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        task_id: PERSISTED_TASK_ID,
        ai_draft: { nodes: DRAFT.nodes, edges: DRAFT.edges },
        suggestion_record_id: "suggestion-1",
        previous_graph: null,
      }),
    );
    expect(syncPersistedWorkflowRows).toHaveBeenCalledWith(client);
  });

  it("keeps approval on the local row until reconciliation replaces it", async () => {
    const client = {};
    const dispatch = vi.fn();
    const local = aliasKnownLocalTaskState();
    createSupabaseBrowserClientMock.mockReturnValue(client);
    approveTaskMapMock.mockResolvedValue(undefined);
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: {
        phase: "ready",
        taskId: local.localTaskId,
        draft: DRAFT,
        suggestionRecordId: null,
      },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: dispatch as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: local.state },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(local.state),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await act(async () => {
      await result.current.approveTaskMapDraftAction(local.localTaskId, DRAFT);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "approveTaskMapLocal",
      taskId: local.localTaskId,
      graph: DRAFT,
    });
    expect(approveTaskMapMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ task_id: PERSISTED_TASK_ID }),
    );
  });
});

// W3-16 finding 9: the stale-response guard compares only `phase` and
// `taskId`. A request that was dismissed and then re-asked for the SAME task
// looks identical to the newer one, so whichever response settles first
// wins. The two KNOWN BUG cases below are `it.fails`: they hold the correct
// expectation and pass only while the bug is present. When the guard learns
// to tell two requests for one task apart, they turn red; flip them to `it`.
describe("useTaskMapDraftActions: same-task dismiss and reopen (W3-16 #9)", () => {
  const OLD_DRAFT = {
    schema_version: "1.0" as const,
    nodes: [
      { id: "old", title: "Stale dismissed step", role: "required" as const },
    ],
    edges: [],
  };
  const NEW_DRAFT = {
    schema_version: "1.0" as const,
    nodes: [
      { id: "new", title: "Fresh requested step", role: "required" as const },
    ],
    edges: [],
  };

  beforeEach(() => {
    requestTaskMapDraftMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    createSupabaseBrowserClientMock.mockReturnValue(null);
  });

  function gatedRequests() {
    const resolvers: Array<(result: TaskMapDraftRequestResult) => void> = [];
    requestTaskMapDraftMock.mockImplementation(
      () =>
        new Promise<TaskMapDraftRequestResult>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    return resolvers;
  }

  function renderDraftHook() {
    const alias = aliasKnownLocalTaskState();
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: alias.state },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: taskAliasRef(alias.state),
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );
    return { result, taskMapDraftRef, taskId: alias.localTaskId };
  }

  it("control: a dismissed request that settles with nothing newer leaves the draft idle", async () => {
    const resolvers = gatedRequests();
    const { result, taskMapDraftRef, taskId } = renderDraftHook();

    let first: Promise<void>;
    act(() => {
      first = result.current.requestTaskMapDraftAction(taskId);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.dismissTaskMapDraftAction();
    });

    await act(async () => {
      resolvers[0]!({
        ok: true,
        draft: OLD_DRAFT,
        suggestionRecordId: "old-suggestion",
      });
      await first!;
    });

    expect(taskMapDraftRef.current).toEqual({ phase: "idle" });
  });

  // KNOWN BUG (W3-16 #9): expected failure until the guard is per-request.
  it.fails(
    "only the newer request fills the draft when the dismissed one settles first",
    async () => {
      const resolvers = gatedRequests();
      const { result, taskMapDraftRef, taskId } = renderDraftHook();

      let first: Promise<void>;
      act(() => {
        first = result.current.requestTaskMapDraftAction(taskId);
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => {
        result.current.dismissTaskMapDraftAction();
      });
      let second: Promise<void>;
      act(() => {
        second = result.current.requestTaskMapDraftAction(taskId);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(resolvers).toHaveLength(2);

      // The dismissed request settles first ...
      await act(async () => {
        resolvers[0]!({
          ok: true,
          draft: OLD_DRAFT,
          suggestionRecordId: "old-suggestion",
        });
        await first!;
      });
      // ... and must not occupy the draft the newer request owns.
      expect(taskMapDraftRef.current).toEqual({ phase: "pending", taskId });

      await act(async () => {
        resolvers[1]!({
          ok: true,
          draft: NEW_DRAFT,
          suggestionRecordId: "new-suggestion",
        });
        await second!;
      });

      expect(taskMapDraftRef.current).toEqual({
        phase: "ready",
        taskId,
        draft: NEW_DRAFT,
        suggestionRecordId: "new-suggestion",
      });
    },
  );

  // KNOWN BUG (W3-16 #9): expected failure until the guard is per-request.
  it.fails(
    "a late failure from the dismissed request does not fail the newer request",
    async () => {
      const resolvers = gatedRequests();
      const { result, taskMapDraftRef, taskId } = renderDraftHook();

      let first: Promise<void>;
      act(() => {
        first = result.current.requestTaskMapDraftAction(taskId);
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => {
        result.current.dismissTaskMapDraftAction();
      });
      act(() => {
        void result.current.requestTaskMapDraftAction(taskId);
      });
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        resolvers[0]!({
          ok: false,
          error: "provider timed out",
          degrade: "breakdown_rail",
        });
        await first!;
      });

      expect(taskMapDraftRef.current).toEqual({ phase: "pending", taskId });
    },
  );
});
