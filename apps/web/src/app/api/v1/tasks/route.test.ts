import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  listPlanningItems: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/data/workflow", () => ({
  listPlanningItems: mocks.listPlanningItems,
}));

import { GET } from "./route";

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/tasks", { headers });

describe("GET /api/v1/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing bearer token with 401 and never touches the data layer", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).ok).toBe(false);
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(mocks.listPlanningItems).not.toHaveBeenCalled();
  });

  it("rejects a non-bearer authorization header with 401", async () => {
    const response = await GET(
      makeRequest({ authorization: "Basic dXNlcjpwYXNz" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
  });

  it("verifies the token BEFORE any data work and maps auth failure to 401", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new Error("Sign in before using this server action."),
    );

    const response = await GET(
      makeRequest({ authorization: "Bearer invalid-token" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.requireSupabaseServerUser).toHaveBeenCalledWith(
      "invalid-token",
    );
    expect(mocks.listPlanningItems).not.toHaveBeenCalled();
  });

  it("returns the caller's tasks through the user-scoped client (RLS seam)", async () => {
    const userClient = { tag: "user-scoped" };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "user-1" },
    });
    mocks.listPlanningItems.mockResolvedValue({
      provider: "supabase",
      tasks: [{ id: "t1", title: "Do the thing" }],
      proposals: [],
      blocks: [],
    });

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      api_version: "1",
      provider: "supabase",
      data: { tasks: [{ id: "t1", title: "Do the thing" }] },
    });
    // The route must pass the user-scoped client through — never a
    // service-role or fresh anonymous client.
    expect(mocks.listPlanningItems).toHaveBeenCalledWith(userClient);
    // Proposals/blocks from the shared planning read are not leaked into the
    // v1 tasks contract.
    expect(body.data.proposals).toBeUndefined();
    expect(body.data.blocks).toBeUndefined();
  });

  it("maps data-layer failures to 500 without leaking internals", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.listPlanningItems.mockRejectedValue(new Error("boom"));

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
