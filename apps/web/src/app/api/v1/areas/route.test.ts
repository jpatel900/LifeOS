import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  listAreas: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/data/workflow", () => ({
  listAreas: mocks.listAreas,
}));

import { GET } from "./route";

const makeRequest = (headers: Record<string, string> = {}, query = "") =>
  new Request(`http://localhost/api/v1/areas${query}`, { headers });

describe("GET /api/v1/areas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing bearer token with 401 and never touches the data layer", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).ok).toBe(false);
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(mocks.listAreas).not.toHaveBeenCalled();
  });

  it("verifies the token BEFORE any data work and maps auth failure to 401", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new Error("Sign in before using this server action."),
    );

    const response = await GET(
      makeRequest({ authorization: "Bearer invalid-token" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.listAreas).not.toHaveBeenCalled();
  });

  it("returns active areas through the user-scoped client (RLS seam)", async () => {
    const userClient = { tag: "user-scoped" };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "user-1" },
    });
    mocks.listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [{ id: "a1", name: "Work", is_active: true }],
    });

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      api_version: "1",
      provider: "supabase",
      data: { areas: [{ id: "a1", name: "Work" }] },
    });
    // The route must pass the user-scoped client through — never a
    // service-role or fresh anonymous client — and default to active-only.
    expect(mocks.listAreas).toHaveBeenCalledWith(userClient, {
      includeInactive: false,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes include_inactive=1 through as the web read's option", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.listAreas.mockResolvedValue({ provider: "supabase", areas: [] });

    await GET(
      makeRequest({ authorization: "Bearer good" }, "?include_inactive=1"),
    );
    expect(mocks.listAreas).toHaveBeenCalledWith(expect.anything(), {
      includeInactive: true,
    });
  });

  it("maps data-layer failures to 500 without leaking internals", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.listAreas.mockRejectedValue(new Error("boom"));

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
