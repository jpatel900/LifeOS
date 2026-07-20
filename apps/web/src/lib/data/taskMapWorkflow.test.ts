import { describe, expect, it, vi } from "vitest";
import {
  approveTaskMap,
  recordTaskMapDraftSuggestion,
  rejectTaskMapSuggestionFireAndForget,
  setTaskMapNodeCompletion,
  TASK_MAP_DRAFT_POLICY_ID,
  TASK_MAP_REVISION_POLICY_ID,
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

  // FR-031 slice F5 (#679): evidence-triggered revisions are measurable
  // under their own policy id.
  it("writes the task_map_revision.v1 policy id when the caller passes it", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: suggestionId }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    await recordTaskMapDraftSuggestion(authenticatedClient(from), {
      area_id: areaId,
      task_id: taskId,
      node_counts: { required: 2, optional: 0, red: 0 },
      node_titles: ["Gather inputs", "Do the work"],
      generated_from: "revision",
      policy_identifier: TASK_MAP_REVISION_POLICY_ID,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        policy_identifier: TASK_MAP_REVISION_POLICY_ID,
        suggestion_json: expect.objectContaining({
          generated_from: "revision",
        }),
      }),
    );
  });
});

// FR-031 slice F5 (#679): rejecting a revision proposal flips ONLY the
// suggestion row — no tasks-table write can even be attempted here.
describe("rejectTaskMapSuggestionFireAndForget", () => {
  it("updates the suggestion row to rejected and never touches tasks", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const client = authenticatedClient(from);

    rejectTaskMapSuggestionFireAndForget(
      client,
      suggestionId,
      "2026-07-18T10:00:00.000Z",
    );
    // Fire-and-forget: give the detached promise a tick to run.
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

    expect(from).toHaveBeenCalledWith("suggestion_records");
    expect(from).not.toHaveBeenCalledWith("tasks");
    expect(update).toHaveBeenCalledWith({
      status: "rejected",
      decided_by: "user",
      resolved_at: "2026-07-18T10:00:00.000Z",
    });
    expect(eq).toHaveBeenCalledWith("id", suggestionId);
  });

  it("contains a failed write without throwing (learning-write failure never breaks dismiss)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const eq = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "update failed" } });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    expect(() =>
      rejectTaskMapSuggestionFireAndForget(
        authenticatedClient(from),
        suggestionId,
        "2026-07-18T10:00:00.000Z",
      ),
    ).not.toThrow();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
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

  // FR-023 slice F4 (#678): the approve write sets `first_tiny_step` to the
  // effective first node's title in the SAME tasks.update (identity,
  // criterion 3).
  it("writes first_tiny_step from the flagged entry node in the same update", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });
    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      throw new Error(`Unexpected table ${table}`);
    });

    const flaggedGraph = {
      schema_version: "1.0",
      nodes: [
        {
          id: "step-1",
          title: "Open the doc",
          role: "required",
          two_minute_move: true,
        },
        { id: "step-2", title: "Do the work", role: "required" },
      ],
      edges: [{ from: "step-1", to: "step-2" }],
    };

    await approveTaskMap(authenticatedClient(from), {
      task_id: taskId,
      area_id: areaId,
      graph: flaggedGraph,
      ai_draft: null,
    });

    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ first_tiny_step: "Open the doc" }),
    );
  });

  it("writes first_tiny_step from the critical-path head when no node is flagged", async () => {
    const taskSingle = vi
      .fn()
      .mockResolvedValue({ data: taskRow, error: null });
    const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
    const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
    const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });
    const from = vi.fn((table: string) => {
      if (table === "tasks") return { update: taskUpdate };
      throw new Error(`Unexpected table ${table}`);
    });

    await approveTaskMap(authenticatedClient(from), {
      task_id: taskId,
      area_id: areaId,
      graph: validGraph,
      ai_draft: null,
    });

    // validGraph is step-1 (Gather inputs) -> step-2; the critical-path head
    // is step-1.
    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ first_tiny_step: "Gather inputs" }),
    );
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

  // FR-031 slice 8 — regen carry-forward matrix. `previous_graph` is the
  // prior approved map; the new graph being approved is the regen
  // revision. Asserts the write itself (`taskUpdate` payload), not just
  // the returned `task`, so a bug that carries forward locally but not
  // into the write would still be caught.
  describe("regen completion carry-forward (previous_graph)", () => {
    function stubTaskUpdate() {
      const taskSingle = vi
        .fn()
        .mockResolvedValue({ data: taskRow, error: null });
      const taskSelect = vi.fn().mockReturnValue({ single: taskSingle });
      const taskEq = vi.fn().mockReturnValue({ select: taskSelect });
      const taskUpdate = vi.fn().mockReturnValue({ eq: taskEq });
      const from = vi.fn((table: string) => {
        if (table === "tasks") return { update: taskUpdate };
        if (table === "suggestion_records") {
          return { update: vi.fn().mockReturnValue({ eq: vi.fn() }) };
        }
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
      return { from, taskUpdate };
    }

    const previousGraph = {
      schema_version: "1.0",
      nodes: [
        {
          id: "step-1",
          title: "Gather inputs",
          role: "required",
          done: true,
          completed_at: "2026-07-10T09:00:00.000Z",
        },
        { id: "step-2", title: "Do the work", role: "required", done: false },
      ],
      edges: [{ from: "step-1", to: "step-2" }],
    };

    it("survives: a completed node whose id is unchanged in the revision keeps done/completed_at", async () => {
      const { from, taskUpdate } = stubTaskUpdate();
      const revisedGraph = {
        schema_version: "1.0",
        nodes: [
          { id: "step-1", title: "Gather inputs (revised)", role: "required" },
          { id: "step-2", title: "Do the work", role: "required" },
        ],
        edges: [{ from: "step-1", to: "step-2" }],
      };

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: revisedGraph,
        ai_draft: null,
        previous_graph: previousGraph,
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string; done?: boolean }[] };
      };
      const step1 = written.progression_map.nodes.find(
        (node) => node.id === "step-1",
      );
      expect(step1?.done).toBe(true);
      expect((step1 as { completed_at?: string }).completed_at).toBe(
        "2026-07-10T09:00:00.000Z",
      );
    });

    it("dropped: a completed node whose id no longer appears in the revision carries nothing forward", async () => {
      const { from, taskUpdate } = stubTaskUpdate();
      const revisedGraph = {
        schema_version: "1.0",
        nodes: [{ id: "step-2", title: "Do the work", role: "required" }],
        edges: [],
      };

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: revisedGraph,
        ai_draft: null,
        previous_graph: previousGraph,
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string }[] };
      };
      expect(written.progression_map.nodes.map((node) => node.id)).toEqual([
        "step-2",
      ]);
    });

    it("renamed-id: a completed node given a new id in the revision does not carry forward", async () => {
      const { from, taskUpdate } = stubTaskUpdate();
      const revisedGraph = {
        schema_version: "1.0",
        nodes: [
          { id: "step-1-renamed", title: "Gather inputs", role: "required" },
          { id: "step-2", title: "Do the work", role: "required" },
        ],
        edges: [{ from: "step-1-renamed", to: "step-2" }],
      };

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: revisedGraph,
        ai_draft: null,
        previous_graph: previousGraph,
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string; done?: boolean }[] };
      };
      const renamed = written.progression_map.nodes.find(
        (node) => node.id === "step-1-renamed",
      );
      expect(renamed?.done).toBeUndefined();
    });

    it("role-changed-to-red: a completed node reclassified as red in the revision never carries forward completion", async () => {
      const { from, taskUpdate } = stubTaskUpdate();
      const revisedGraph = {
        schema_version: "1.0",
        nodes: [
          {
            id: "step-1",
            title: "Gather inputs",
            role: "red",
            red_reason: "No longer needed.",
          },
          { id: "step-2", title: "Do the work", role: "required" },
        ],
        edges: [],
      };

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: revisedGraph,
        ai_draft: null,
        previous_graph: previousGraph,
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string; done?: boolean }[] };
      };
      const step1 = written.progression_map.nodes.find(
        (node) => node.id === "step-1",
      );
      expect(step1?.done).toBeUndefined();
    });

    it("no previous_graph (first-time approve) never carries anything forward", async () => {
      const { from, taskUpdate } = stubTaskUpdate();

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: validGraph,
        ai_draft: null,
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string; done?: boolean }[] };
      };
      expect(written.progression_map.nodes.every((node) => !node.done)).toBe(
        true,
      );
    });

    it("degrades to no carry-forward (rather than throwing) when previous_graph fails validation", async () => {
      const { from, taskUpdate } = stubTaskUpdate();

      await approveTaskMap(authenticatedClient(from), {
        task_id: taskId,
        area_id: areaId,
        graph: validGraph,
        ai_draft: null,
        previous_graph: { schema_version: "1.0", nodes: [], edges: [] },
      });

      const written = taskUpdate.mock.calls[0]![0] as {
        progression_map: { nodes: { id: string; done?: boolean }[] };
      };
      expect(written.progression_map.nodes.every((node) => !node.done)).toBe(
        true,
      );
    });
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
