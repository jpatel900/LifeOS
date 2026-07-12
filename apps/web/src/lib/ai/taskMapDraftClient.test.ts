import { describe, expect, it, vi } from "vitest";
import { requestTaskMapDraft } from "./taskMapDraftClient";

const validDraft = {
  schema_version: "1.0",
  nodes: [
    { id: "n1", title: "Draft outline", role: "required" },
    { id: "n2", title: "Send for review", role: "required" },
  ],
  edges: [{ from: "n1", to: "n2" }],
};

describe("requestTaskMapDraft", () => {
  it("posts the task fields and forwards the bearer token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        parser: "mock",
        draft: validDraft,
        suggestionRecordId: "sugg-1",
        status: "mock",
      }),
    })) as unknown as typeof fetch;

    const result = await requestTaskMapDraft({
      taskId: "task-1",
      areaId: "area-1",
      title: "Ship the report",
      description: null,
      definitionOfDone: "Report sent",
      firstTinyStep: "Open the doc",
      authorization: "Bearer token-123",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/task-map");
    expect(
      (init as RequestInit & { headers: Record<string, string> }).headers
        .Authorization,
    ).toBe("Bearer token-123");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.taskId).toBe("task-1");
    expect(body.title).toBe("Ship the report");

    expect(result).toEqual({
      ok: true,
      draft: validDraft,
      suggestionRecordId: "sugg-1",
    });
  });

  it("FR-031 slice 8: sends currentMap when provided (regen) and null when omitted (initial draft)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        parser: "mock",
        draft: validDraft,
        suggestionRecordId: null,
        status: "mock",
      }),
    })) as unknown as typeof fetch;

    await requestTaskMapDraft({
      taskId: "task-1",
      areaId: null,
      title: "Ship the report",
      description: null,
      definitionOfDone: null,
      firstTinyStep: null,
      fetchImpl,
    });
    const [, initialInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(
      JSON.parse((initialInit as RequestInit).body as string).currentMap,
    ).toBeNull();

    const currentMap = {
      nodes: [
        {
          id: "n1",
          title: "Draft outline",
          role: "required" as const,
          done: true,
        },
      ],
      edges: [],
    };
    await requestTaskMapDraft({
      taskId: "task-1",
      areaId: null,
      title: "Ship the report",
      description: null,
      definitionOfDone: null,
      firstTinyStep: null,
      fetchImpl,
      currentMap,
    });
    const [, regenInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[1];
    expect(
      JSON.parse((regenInit as RequestInit).body as string).currentMap,
    ).toEqual(currentMap);
  });

  it("degrades to breakdown_rail on ok:false", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: false,
        degrade: "breakdown_rail",
        errors: ["invalid"],
      }),
    })) as unknown as typeof fetch;

    const result = await requestTaskMapDraft({
      taskId: "task-1",
      areaId: null,
      title: "Ship the report",
      description: null,
      definitionOfDone: null,
      firstTinyStep: null,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degrade).toBe("breakdown_rail");
    }
  });

  it("degrades safely when fetch throws (network failure)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await requestTaskMapDraft({
      taskId: "task-1",
      areaId: null,
      title: "Ship the report",
      description: null,
      definitionOfDone: null,
      firstTinyStep: null,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
  });

  it("degrades when the draft fails schema validation", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        draft: { schema_version: "1.0", nodes: [], edges: [] }, // nodes.min(1) fails
        suggestionRecordId: null,
      }),
    })) as unknown as typeof fetch;

    const result = await requestTaskMapDraft({
      taskId: "task-1",
      areaId: null,
      title: "Ship the report",
      description: null,
      definitionOfDone: null,
      firstTinyStep: null,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
  });
});
