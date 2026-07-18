import { describe, expect, it, vi } from "vitest";
import { TASK_MAP_DRAFT_SCHEMA_VERSION } from "./contracts/taskMapDraft";
import {
  generateTaskMapDraftWithFallback,
  getTaskMapDraftStatus,
} from "./taskMapDraftService";

describe("task map draft server service", () => {
  it("reports status as configured when AI is enabled and model+key are present", () => {
    const status = getTaskMapDraftStatus({
      OPENAI_API_KEY: "test-key",
      AI_MODEL_STANDARD: "standard-model",
    });

    expect(status).toEqual({ status: "ai_configured", preferredParser: "ai" });
  });

  it("reports status as unavailable when the key is present but no model is configured", () => {
    const status = getTaskMapDraftStatus({ OPENAI_API_KEY: "test-key" });

    expect(status).toEqual({
      status: "ai_unavailable",
      preferredParser: "mock",
    });
  });

  it("reports status as mock when task-map drafting is disabled", () => {
    const status = getTaskMapDraftStatus({
      OPENAI_API_KEY: "test-key",
      AI_MODEL_STANDARD: "standard-model",
      AI_TASK_MAP_DRAFT_ENABLED: "false",
    });

    expect(status).toEqual({ status: "mock", preferredParser: "mock" });
  });

  it("builds a deterministic, valid mock draft from an existing breakdown", async () => {
    const result = await generateTaskMapDraftWithFallback(
      {
        title: "Ship the report",
        breakdownSteps: [
          { title: "Gather inputs", estimatedMinutes: 10 },
          { title: "Draft the report", estimatedMinutes: 30 },
          { title: "Send for review", estimatedMinutes: 5 },
        ],
      },
      { env: {}, forceMock: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parser).toBe("mock");
    expect(result.draft.schema_version).toBe(TASK_MAP_DRAFT_SCHEMA_VERSION);
    expect(result.draft.nodes.map((node) => node.title)).toEqual([
      "Gather inputs",
      "Draft the report",
      "Send for review",
    ]);
    expect(result.draft.nodes.every((node) => node.role === "required")).toBe(
      true,
    );
    expect(result.draft.edges).toEqual([
      { from: "step-1", to: "step-2" },
      { from: "step-2", to: "step-3" },
    ]);
    // FR-023 slice F4 (#678): the mock marks node 1 (the linear entry) as the
    // two-minute opening move, and only node 1.
    expect(result.draft.nodes[0]?.two_minute_move).toBe(true);
    expect(
      result.draft.nodes.slice(1).every((node) => !node.two_minute_move),
    ).toBe(true);
  });

  it("falls back to a single generic node when no breakdown exists", async () => {
    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      { env: {}, forceMock: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.nodes).toHaveLength(1);
  });

  it("rejects a blank title without ever calling the AI provider", async () => {
    const taskMapDraftImpl = vi.fn();
    const result = await generateTaskMapDraftWithFallback(
      { title: "   " },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.degrade).toBe("breakdown_rail");
    expect(result.errorCategory).toBe("input_invalid");
    expect(taskMapDraftImpl).not.toHaveBeenCalled();
  });

  it("uses the injected AI implementation and returns its validated draft", async () => {
    const aiDraft = {
      schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required" as const },
        { id: "step-2", title: "Do the work", role: "required" as const },
      ],
      edges: [{ from: "step-1", to: "step-2" }],
    };
    const taskMapDraftImpl = vi.fn().mockResolvedValue(aiDraft);

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parser).toBe("ai");
    expect(result.draft).toEqual(aiDraft);
    expect(taskMapDraftImpl).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ship the report" }),
      expect.objectContaining({ apiKey: "test-key", model: "standard-model" }),
    );
  });

  it("FR-031 slice 8: forwards currentMap to the AI implementation for a regen request", async () => {
    const aiDraft = {
      schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required" as const },
        { id: "step-2", title: "Do the work", role: "required" as const },
      ],
      edges: [{ from: "step-1", to: "step-2" }],
    };
    const taskMapDraftImpl = vi.fn().mockResolvedValue(aiDraft);
    const currentMap = {
      nodes: [
        {
          id: "step-1",
          title: "Gather inputs",
          role: "required" as const,
          done: true,
        },
      ],
      edges: [],
    };

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report", currentMap },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(true);
    expect(taskMapDraftImpl).toHaveBeenCalledWith(
      expect.objectContaining({ currentMap }),
      expect.anything(),
    );
  });

  it("degrades to breakdown_rail on a provider failure (never throws)", async () => {
    const taskMapDraftImpl = vi
      .fn()
      .mockRejectedValue(new Error("request failed: 503"));

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.degrade).toBe("breakdown_rail");
    expect(result.errorCategory).toBe("provider_runtime_unavailable");
  });

  it("degrades to breakdown_rail when the AI output fails schema validation", async () => {
    const taskMapDraftImpl = vi.fn().mockResolvedValue({
      schema_version: "2.0", // invalid — wrong literal
      nodes: [],
      edges: [],
    });

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(false);
  });

  it("degrades to breakdown_rail when the AI output is graph-invalid (e.g. a cycle)", async () => {
    const cyclicDraft = {
      schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
      nodes: [
        { id: "step-1", title: "Gather inputs", role: "required" as const },
        { id: "step-2", title: "Do the work", role: "required" as const },
      ],
      edges: [
        { from: "step-1", to: "step-2" },
        { from: "step-2", to: "step-1" },
      ],
    };
    const taskMapDraftImpl = vi.fn().mockResolvedValue(cyclicDraft);

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.degrade).toBe("breakdown_rail");
    expect(result.errorCategory).toBe("graph_invalid");
    expect(result.errors.join(" ")).toMatch(/cycle/i);
  });

  it("never leaks raw provider error text in the degrade errors array", async () => {
    const taskMapDraftImpl = vi
      .fn()
      .mockRejectedValue(new Error("secret internal detail: do not leak"));

    const result = await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).not.toMatch(/secret internal detail/i);
  });

  it("records an ai_call_traces row for a successful AI generation", async () => {
    const recordAiCallTraceImpl = vi.fn().mockResolvedValue(undefined);
    const aiDraft = {
      schema_version: TASK_MAP_DRAFT_SCHEMA_VERSION,
      nodes: [{ id: "step-1", title: "Do it", role: "required" as const }],
      edges: [],
    };

    await generateTaskMapDraftWithFallback(
      { title: "Ship the report" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        taskMapDraftImpl: vi.fn().mockResolvedValue(aiDraft),
        traceContext: { accessToken: "user-token" },
        recordAiCallTraceImpl,
      },
    );

    expect(recordAiCallTraceImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "user-token",
        surface: "task_map_draft",
        validationOutcome: "passed",
      }),
    );
  });
});
