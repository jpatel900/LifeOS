import { describe, expect, it, vi } from "vitest";
import {
  approveTaskMap,
  recordTaskMapDraftSuggestion,
  setTaskMapNodeCompletion,
  TASK_MAP_DRAFT_POLICY_ID,
  type MinimalSupabaseClient,
} from "./workflow";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const areaId = "550e8400-e29b-41d4-a716-446655440101";
const taskId = "550e8400-e29b-41d4-a716-446655440301";
const suggestionId = "550e8400-e29b-41d4-a716-446655440901";

const validGraph = {
  schema_version: "1.0",
  nodes: [
    { id: "step-1", title: "Gather inputs", role: "required" },
    { id: "step-2", title: "Do the work", role: "required" },
  ],
  edges: [{ from: "step-1", to: "step-2" }],
};

const taskRow = {
  id: taskId,
  user_id: userId,
  area_id: areaId,
  project_id: null,
  source_capture_item_id: null,
  title: "Ship the report",
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: null,
  task_type: null,
  energy_type: null,
  estimated_minutes_low: null,
  estimated_minutes_high: null,
  due_at: null,
  definition_of_done: null,
  first_tiny_step: null,
  progression_map: validGraph,
  map_status: "approved",
  map_schema_version: "1.0",
  map_approved_at: "2026-07-12T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-12T00:00:00.000Z",
};

function authenticatedClient(from: MinimalSupabaseClient["from"]) {
  return {
    from,
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as unknown as MinimalSupabaseClient;
}

describe("recordTaskMapDraftSuggestion", () => {
  it("returns a null suggestionId in mock mode without throwing", async () => {
    const result = await recordTaskMapDraftSuggestion(null, {
      area_id: areaId,
      task_id: taskId,
      node_counts: { required: 2, optional: 0, red: 0 },
      node_titles: ["Gather inputs", "Do the work"],
    });

    expect(result).toEqual({ provider: "mock", suggestionId: null });
  });

  it("writes a pending suggestion_records row and returns its id", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: suggestionId }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await recordTaskMapDraftSuggestion(
      authenticatedClient(from),
      {
        area_id: areaId,
        task_id: taskId,
        node_counts: { required: 2, optional: 0, red: 0 },
        node_titles: ["Gather inputs", "Do the work"],
      },
    );

    expect(from).toHaveBeenCalledWith("suggestion_records");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        policy_identifier: TASK_MAP_DRAFT_POLICY_ID,
        suggestion_type: "task_map_draft",
        subject_type: "task",
        subject_id: taskId,
        status: "pending",
      }),
    );
    expect(result).toEqual({ provider: "supabase", suggestionId });
  });

  it("degrades to a null suggestionId when the write fails, without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "insert failed" } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const result = await recordTaskMapDraftSuggestion(
      authenticatedClient(from),
      {
        area_id: areaId,
        task_id: taskId,
        node_counts: { required: 1, optional: 0, red: 0 },
        node_titles: ["Do it"],
      },
    );

    expect(result).toEqual({ provider: "supabase", suggestionId: null });
    warn.mockRestore();
  });
});

describe("approveTaskMap", () => {
  it("rejects an invalid graph and never touches the database", async () => {
    const from = vi.fn(() => {
      throw new Error("approveTaskMap must not write an invalid graph.");
    });

    await expect(
      approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: { schema_version: "1.0", nodes: [], edges: [] },
        ai_draft: null,
      }),
    ).rejects.toThrow(/failed validation/);
  });

  it("persists a valid graph as approved and resolves the suggestion row", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });

    const suggestionEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const suggestionUpdate = vi.fn().mockReturnValue({ eq: suggestionEq });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      if (table === "suggestion_records") return { update: suggestionUpdate };
      if (table === "override_records") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: {}, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await approveTaskMap(authenticatedClient(from), {
      task_id: taskId,
      area_id: areaId,
      graph: validGraph,
      ai_draft: { nodes: validGraph.nodes as never, edges: validGraph.edges },
      suggestion_record_id: suggestionId,
    });

    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        progression_map: validGraph,
        map_status: "approved",
        map_schema_version: "1.0",
      }),
    );
    expect(taskEq).toHaveBeenCalledWith("id", taskId);
    expect(result.provider).toBe("supabase");
    expect(result.task.map_status).toBe("approved");

    await vi.waitFor(() => {
      expect(suggestionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted", decided_by: "user" }),
      );
    });
  });

  it("records one override_records row per changed node and none for unchanged nodes", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });

    const overrideInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      if (table === "override_records") return { insert: overrideInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const aiDraft = {
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required" as const },
        { id: "step-2", title: "Old title", role: "required" as const },
        { id: "step-3", title: "Removed step", role: "optional" as const },
      ],
      edges: [
        { from: "step-1", to: "step-2" },
        { from: "step-1", to: "step-3" },
      ],
    };

    const approvedGraph = {
      schema_version: "1.0",
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required" }, // unchanged
        { id: "step-2", title: "New title", role: "required" }, // edited
        { id: "step-4", title: "Added step", role: "optional" }, // added
        // step-3 removed
      ],
      edges: [
        { from: "step-1", to: "step-2" },
        { from: "step-1", to: "step-4" },
      ],
    };

    await approveTaskMap(authenticatedClient(from), {
      task_id: taskId,
      area_id: areaId,
      graph: approvedGraph,
      ai_draft: aiDraft,
      suggestion_record_id: null,
    });

    await vi.waitFor(() => {
      expect(overrideInsert).toHaveBeenCalledTimes(3);
    });

    const overrideTypes = overrideInsert.mock.calls.map(
      (call) => (call[0] as { override_type: string }).override_type,
    );
    expect(overrideTypes.sort()).toEqual(
      ["node_added", "node_edited", "node_removed"].sort(),
    );
  });

  it("throws when no client is available (mock approval is unsupported)", async () => {
    await expect(
      approveTaskMap(null, {
        task_id: taskId,
        area_id: areaId,
        graph: validGraph,
        ai_draft: null,
      }),
    ).rejects.toThrow(/local workflow context/);
  });

  it("never fails approval when the learning writes fail (NS-INV-3)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });

    const suggestionEq = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const suggestionUpdate = vi.fn().mockReturnValue({ eq: suggestionEq });

    const overrideSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const overrideInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: overrideSingle }),
    });

    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      if (table === "suggestion_records") return { update: suggestionUpdate };
      if (table === "override_records") return { insert: overrideInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await approveTaskMap(authenticatedClient(from), {
      task_id: taskId,
      area_id: areaId,
      graph: validGraph,
      ai_draft: { nodes: [], edges: [] },
      suggestion_record_id: suggestionId,
    });

    expect(result.provider).toBe("supabase");
    expect(result.task.map_status).toBe("approved");
    warn.mockRestore();
  });
});

describe("setTaskMapNodeCompletion", () => {
  const graphWithRed = {
    schema_version: "1.0",
    nodes: [
      { id: "step-1", title: "Gather inputs", role: "required" },
      { id: "step-2", title: "Do the work", role: "required" },
      {
        id: "red-1",
        title: "Do not ship early",
        role: "red",
        red_reason: "Needs sign-off first.",
      },
    ],
    edges: [{ from: "step-1", to: "step-2" }],
  };

  function taskRowWithGraph(graph: unknown) {
    return { ...taskRow, progression_map: graph };
  }

  it("rejects an invalid current graph and never touches the database", async () => {
    const from = vi.fn(() => {
      throw new Error(
        "setTaskMapNodeCompletion must not write when the graph fails validation.",
      );
    });

    await expect(
      setTaskMapNodeCompletion(authenticatedClient(from), {
        task_id: taskId,
        node_id: "step-1",
        graph: { schema_version: "1.0", nodes: [], edges: [] },
        now: "2026-07-12T12:00:00.000Z",
      }),
    ).rejects.toThrow(/failed validation/);
  });

  it("rejects an unknown node id and never touches the database", async () => {
    const from = vi.fn(() => {
      throw new Error(
        "setTaskMapNodeCompletion must not write for an unknown node id.",
      );
    });

    await expect(
      setTaskMapNodeCompletion(authenticatedClient(from), {
        task_id: taskId,
        node_id: "does-not-exist",
        graph: graphWithRed,
        now: "2026-07-12T12:00:00.000Z",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects a red node and never touches the database", async () => {
    const from = vi.fn(() => {
      throw new Error(
        "setTaskMapNodeCompletion must not write for a red node.",
      );
    });

    await expect(
      setTaskMapNodeCompletion(authenticatedClient(from), {
        task_id: taskId,
        node_id: "red-1",
        graph: graphWithRed,
        now: "2026-07-12T12:00:00.000Z",
      }),
    ).rejects.toThrow(/Red task-map nodes/);
  });

  it("marks a required node done and persists the updated graph", async () => {
    const now = "2026-07-12T12:00:00.000Z";
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRowWithGraph(graphWithRed), error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });
    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await setTaskMapNodeCompletion(authenticatedClient(from), {
      task_id: taskId,
      node_id: "step-1",
      graph: graphWithRed,
      now,
    });

    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        progression_map: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: "step-1",
              done: true,
              completed_at: now,
            }),
          ]),
        }),
      }),
    );
    expect(taskEq).toHaveBeenCalledWith("id", taskId);
    expect(result.provider).toBe("supabase");
  });

  it("undoes a completed node back to not-done", async () => {
    const doneGraph = {
      ...graphWithRed,
      nodes: graphWithRed.nodes.map((node) =>
        node.id === "step-1"
          ? { ...node, done: true, completed_at: "2026-07-12T12:00:00.000Z" }
          : node,
      ),
    };
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRowWithGraph(doneGraph), error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });
    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      throw new Error(`Unexpected table ${table}`);
    });

    await setTaskMapNodeCompletion(authenticatedClient(from), {
      task_id: taskId,
      node_id: "step-1",
      graph: doneGraph,
      now: "2026-07-12T13:00:00.000Z",
    });

    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        progression_map: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: "step-1",
              done: false,
              completed_at: null,
            }),
          ]),
        }),
      }),
    );
  });

  it("throws when no client is available (mock completion is unsupported)", async () => {
    await expect(
      setTaskMapNodeCompletion(null, {
        task_id: taskId,
        node_id: "step-1",
        graph: graphWithRed,
        now: "2026-07-12T12:00:00.000Z",
      }),
    ).rejects.toThrow(/local workflow context/);
  });
});
