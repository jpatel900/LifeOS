import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  getTaskMapDraftStatus: vi.fn(),
  generateTaskMapDraftWithFallback: vi.fn(),
  recordTaskMapDraftSuggestion: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/ai/taskMapDraftService", () => ({
  getTaskMapDraftStatus: mocks.getTaskMapDraftStatus,
  generateTaskMapDraftWithFallback: mocks.generateTaskMapDraftWithFallback,
}));

vi.mock("@/lib/data/workflow", () => ({
  recordTaskMapDraftSuggestion: mocks.recordTaskMapDraftSuggestion,
  TASK_MAP_DRAFT_POLICY_ID: "task_map.v1",
  TASK_MAP_REVISION_POLICY_ID: "task_map_revision.v1",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/observability", () => ({
  captureError: mocks.captureError,
}));

import { GET, POST } from "./route";

const validDraft = {
  schema_version: "1.0",
  nodes: [
    { id: "step-1", title: "Gather inputs", role: "required" },
    { id: "step-2", title: "Do the work", role: "required" },
  ],
  edges: [{ from: "step-1", to: "step-2" }],
};

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/task-map", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const authHeaders = { Authorization: "Bearer user-a-access-token" };

describe("task-map route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaskMapDraftStatus.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    mocks.recordTaskMapDraftSuggestion.mockResolvedValue({
      provider: "supabase",
      suggestionId: "11111111-1111-4111-8111-111111111111",
    });
    mocks.createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-a" } }, error: null }),
      },
      from: vi.fn(),
    });
  });

  it("returns status from GET", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      status: "ai_configured",
      preferredParser: "ai",
    });
  });

  it("rejects a request with no bearer token (auth rejected)", async () => {
    const response = await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, errorCategory: "auth_rejected" });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.generateTaskMapDraftWithFallback).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid bearer token before generating a draft", async () => {
    mocks.createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("bad jwt"),
        }),
      },
      from: vi.fn(),
    });

    const response = await POST(
      postRequest(
        { taskId: "task-1", title: "Ship the report" },
        { Authorization: "Bearer invalid-access-token" },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, errorCategory: "auth_rejected" });
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledWith({
      accessToken: "invalid-access-token",
    });
    expect(mocks.generateTaskMapDraftWithFallback).not.toHaveBeenCalled();
    expect(mocks.recordTaskMapDraftSuggestion).not.toHaveBeenCalled();
  });

  it("generates a draft and records a suggestion on success", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: true,
      parser: "ai",
      draft: validDraft,
    });
    const response = await POST(
      postRequest(
        { taskId: "task-1", areaId: "area-1", title: "Ship the report" },
        authHeaders,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.draft).toEqual(validDraft);
    expect(body.suggestionRecordId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledWith({
      accessToken: "user-a-access-token",
    });
    expect(mocks.generateTaskMapDraftWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ship the report" }),
      expect.objectContaining({
        traceContext: { accessToken: "user-a-access-token" },
      }),
    );
    expect(mocks.recordTaskMapDraftSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        area_id: "area-1",
        task_id: "task-1",
        node_counts: { required: 2, optional: 0, red: 0 },
        node_titles: ["Gather inputs", "Do the work"],
      }),
    );
  });

  it("degrades to the breakdown rail on provider failure without persisting anything", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "provider_runtime_unavailable",
      errors: ["AI provider is temporarily unavailable."],
    });

    const response = await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }, authHeaders),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.degrade).toBe("breakdown_rail");
    expect(mocks.recordTaskMapDraftSuggestion).not.toHaveBeenCalled();
  });

  it("degrades to the breakdown rail on AI schema-invalid output", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "provider_schema_validation_failed",
      errors: ["AI task-map draft response failed schema validation."],
    });

    const response = await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }, authHeaders),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.degrade).toBe("breakdown_rail");
  });

  it("degrades to the breakdown rail on graph-invalid AI output", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "graph_invalid",
      errors: ["Cycle detected: step-1 -> step-2 -> step-1"],
    });

    const response = await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }, authHeaders),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.degrade).toBe("breakdown_rail");
    expect(body.errors).toEqual(["Cycle detected: step-1 -> step-2 -> step-1"]);
  });

  it("FR-031 slice 8: forwards currentMap to the service and marks the suggestion as regen", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: true,
      parser: "ai",
      draft: validDraft,
    });
    const currentMap = {
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required", done: true },
        { id: "step-2", title: "Do the work", role: "required", done: false },
      ],
      edges: [{ from: "step-1", to: "step-2" }],
    };

    const response = await POST(
      postRequest(
        {
          taskId: "task-1",
          areaId: "area-1",
          title: "Ship the report",
          currentMap,
        },
        authHeaders,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.generateTaskMapDraftWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        currentMap: {
          ...currentMap,
          // The route normalizes red fields to explicit nulls when absent,
          // and (F5 #679) the estimate/opening-move carry-back fields to
          // null/false when absent.
          nodes: currentMap.nodes.map((node) => ({
            ...node,
            red_reason: null,
            red_condition: null,
            estimated_minutes: null,
            two_minute_move: false,
          })),
        },
      }),
      expect.anything(),
    );
    expect(mocks.recordTaskMapDraftSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ generated_from: "regen" }),
    );
  });

  it("FR-031 slice 8: marks the suggestion as initial when no currentMap is sent", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: true,
      parser: "ai",
      draft: validDraft,
    });
    await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }, authHeaders),
    );

    expect(mocks.recordTaskMapDraftSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        generated_from: "initial",
        policy_identifier: "task_map.v1",
      }),
    );
  });

  it("FR-031 slice F5 (#679): a revision request forwards evidence and records the task_map_revision.v1 policy", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: true,
      parser: "ai",
      draft: validDraft,
    });
    const currentMap = {
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required", done: true },
      ],
      edges: [],
    };
    const revision = {
      signals: [
        {
          kind: "duration_drift",
          detail: "A work session took 60 minutes instead of about 20.",
        },
      ],
    };

    const response = await POST(
      postRequest(
        {
          taskId: "task-1",
          areaId: "area-1",
          title: "Ship the report",
          currentMap,
          revision,
        },
        authHeaders,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mocks.generateTaskMapDraftWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ revisionEvidence: revision }),
      expect.anything(),
    );
    expect(mocks.recordTaskMapDraftSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        generated_from: "revision",
        policy_identifier: "task_map_revision.v1",
      }),
    );
  });

  it("FR-031 slice F5 (#679): rejects a revision payload without currentMap or with an unknown signal kind", async () => {
    const withoutCurrentMap = await POST(
      postRequest(
        {
          taskId: "task-1",
          title: "Ship the report",
          revision: { signals: [{ kind: "duration_drift", detail: "x" }] },
        },
        authHeaders,
      ),
    );
    expect(withoutCurrentMap.status).toBe(400);

    const unknownKind = await POST(
      postRequest(
        {
          taskId: "task-1",
          title: "Ship the report",
          currentMap: {
            nodes: [{ id: "step-1", title: "Gather inputs", role: "required" }],
            edges: [],
          },
          revision: { signals: [{ kind: "vibes", detail: "x" }] },
        },
        authHeaders,
      ),
    );
    expect(unknownKind.status).toBe(400);
    expect(mocks.generateTaskMapDraftWithFallback).not.toHaveBeenCalled();
  });

  it("FR-031 slice 8: still validates and degrades unchanged on a regen request", async () => {
    mocks.generateTaskMapDraftWithFallback.mockResolvedValue({
      ok: false,
      degrade: "breakdown_rail",
      errorCategory: "graph_invalid",
      errors: ["Cycle detected: step-1 -> step-2 -> step-1"],
    });

    const currentMap = {
      nodes: [{ id: "step-1", title: "Gather inputs", role: "required" }],
      edges: [],
    };

    const response = await POST(
      postRequest(
        { taskId: "task-1", title: "Ship the report", currentMap },
        authHeaders,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.degrade).toBe("breakdown_rail");
    expect(mocks.recordTaskMapDraftSuggestion).not.toHaveBeenCalled();
  });

  it("rejects a malformed currentMap.nodes entry with 400", async () => {
    const response = await POST(
      postRequest(
        {
          taskId: "task-1",
          title: "Ship the report",
          currentMap: { nodes: [{ id: "step-1" }], edges: [] },
        },
        authHeaders,
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(mocks.generateTaskMapDraftWithFallback).not.toHaveBeenCalled();
  });

  it("does not leak request validation errors and returns 400 for a malformed body", async () => {
    const response = await POST(
      postRequest({ title: "Missing task id" }, authHeaders),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("taskId is required.");
  });

  it("returns a safe non-throwing degrade when the service call unexpectedly throws", async () => {
    mocks.generateTaskMapDraftWithFallback.mockRejectedValue(
      new Error("internal failure: stack trace should never leak"),
    );

    const response = await POST(
      postRequest({ taskId: "task-1", title: "Ship the report" }, authHeaders),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.degrade).toBe("breakdown_rail");
    expect(JSON.stringify(body)).not.toMatch(/stack trace|internal failure/i);
    expect(mocks.captureError).toHaveBeenCalledWith({
      feature: "task_map_route",
      error: expect.any(Error),
      context: {
        environment: "server",
        error_category: "route_handler_failure",
        route_pattern: "/api/task-map",
      },
    });
  });
});
