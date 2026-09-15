import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dispatch } from "react";
import { createEmptyWorkflowState, type WorkflowState } from "../workflow";
import type { TaskMapDraftRequestResult } from "../ai/taskMapDraftClient";
import type { WorkflowAction } from "./reducerCore";
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

const LOCAL_TASK_ID = "task-1";
const PERSISTED_TASK_ID = "22222222-2222-4222-8222-222222222222";

const DRAFT = {
  schema_version: "1.0" as const,
  nodes: [
    { id: "first", title: "Open the document", role: "required" as const },
  ],
  edges: [],
};

function taskState(taskId: string): WorkflowState {
  const state = createEmptyWorkflowState();
  state.tasks = [
    {
      id: taskId,
      user_id: "11111111-1111-4111-8111-111111111111",
      area_id: "area-main-job",
      project_id: null,
      source_capture_item_id: null,
      title: "Finish the synthetic report",
      description: null,
      status: "active",
      priority_score: null,
      priority_confidence: null,
      task_type: null,
      is_reversible: null,
      energy_type: null,
      estimated_minutes_low: null,
      estimated_minutes_high: null,
      due_at: null,
      definition_of_done: null,
      first_tiny_step: null,
      created_at: "2026-09-15T00:00:00.000Z",
      updated_at: "2026-09-15T00:00:00.000Z",
    },
  ];
  return state;
}

function retiredLocalTaskState(): WorkflowState {
  return taskState(PERSISTED_TASK_ID);
}

function aliasKnownLocalTaskState(): WorkflowState {
  return taskState(LOCAL_TASK_ID);
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
    const stateRef = { current: retiredLocalTaskState() };
    const setTaskMapDraft = vi.fn();

    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft,
        stateRef,
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestTaskMapDraftAction(LOCAL_TASK_ID);
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "pending",
      taskId: LOCAL_TASK_ID,
    });
    expect(requestTaskMapDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: PERSISTED_TASK_ID,
        title: "Finish the synthetic report",
      }),
    );

    await act(async () => {
      resolveRequest!({ ok: true, draft: DRAFT, suggestionRecordId: null });
      await request!;
    });

    expect(taskMapDraftRef.current).toEqual({
      phase: "ready",
      taskId: LOCAL_TASK_ID,
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
    const stateRef = { current: retiredLocalTaskState() };

    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef,
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
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
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: aliasKnownLocalTaskState() },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await act(async () => {
      await result.current.requestTaskMapDraftAction(LOCAL_TASK_ID);
    });

    expect(requestTaskMapDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: PERSISTED_TASK_ID }),
    );
    expect(taskMapDraftRef.current).toEqual({
      phase: "failed",
      taskId: LOCAL_TASK_ID,
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
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: { phase: "idle" },
    };
    const setTaskMapDraft = vi.fn();
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: vi.fn() as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft,
        stateRef: { current: retiredLocalTaskState() },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    let request: Promise<void>;
    act(() => {
      request = result.current.requestTaskMapDraftAction(LOCAL_TASK_ID);
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
    createSupabaseBrowserClientMock.mockReturnValue(client);
    approveTaskMapMock.mockResolvedValue(undefined);
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: {
        phase: "ready",
        taskId: LOCAL_TASK_ID,
        draft: DRAFT,
        suggestionRecordId: "suggestion-1",
      },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: dispatch as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: retiredLocalTaskState() },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows,
      }),
    );

    await act(async () => {
      await result.current.approveTaskMapDraftAction(LOCAL_TASK_ID, DRAFT);
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
    createSupabaseBrowserClientMock.mockReturnValue(client);
    approveTaskMapMock.mockResolvedValue(undefined);
    const taskMapDraftRef: { current: TaskMapDraftState } = {
      current: {
        phase: "ready",
        taskId: LOCAL_TASK_ID,
        draft: DRAFT,
        suggestionRecordId: null,
      },
    };
    const { result } = renderHook(() =>
      useTaskMapDraftActions({
        dispatch: dispatch as unknown as Dispatch<WorkflowAction>,
        taskMapDraftRef,
        setTaskMapDraft: vi.fn(),
        stateRef: { current: aliasKnownLocalTaskState() },
        persistedAreasRef: { current: [] },
        persistedTaskIdByLocalIdRef: {
          current: new Map([[LOCAL_TASK_ID, PERSISTED_TASK_ID]]),
        },
        markLocalOnly: vi.fn(),
        syncPersistedWorkflowRows: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await act(async () => {
      await result.current.approveTaskMapDraftAction(LOCAL_TASK_ID, DRAFT);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "approveTaskMapLocal",
      taskId: LOCAL_TASK_ID,
      graph: DRAFT,
    });
    expect(approveTaskMapMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ task_id: PERSISTED_TASK_ID }),
    );
  });
});
