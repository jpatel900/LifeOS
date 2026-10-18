import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  buildUserDataExport: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/data/export", () => ({
  buildUserDataExport: mocks.buildUserDataExport,
}));

import { GET } from "./route";
import { SupabaseAuthRejectedError } from "@/lib/supabase/server";

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/export", { headers });

describe("GET /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing bearer token with 401 and never touches the data layer", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
      error:
        "Your sign-in is missing or has expired. Sign in again, then retry.",
    });
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(mocks.buildUserDataExport).not.toHaveBeenCalled();
  });

  it("verifies the token BEFORE any data work and maps auth failure to 401 with a generic body (no raw provider error leaked)", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new SupabaseAuthRejectedError("invalid claim: missing sub claim"),
    );

    const response = await GET(
      makeRequest({ authorization: "Bearer invalid-token" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
      error:
        "Your sign-in is missing or has expired. Sign in again, then retry.",
    });
    expect(mocks.buildUserDataExport).not.toHaveBeenCalled();
  });

  it("exports the caller's data through the user-scoped client (RLS seam)", async () => {
    const userClient = { tag: "user-scoped" };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "user-1" },
    });
    mocks.buildUserDataExport.mockResolvedValue({
      exported_at: "2026-07-19T00:00:00.000Z",
      areas: [],
    });

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(200);
    expect(mocks.buildUserDataExport).toHaveBeenCalledWith(userClient);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "lifeos-export-2026-07-19.json",
    );
  });

  it("maps data-layer failures to 500 with a generic body (no exception text leaked)", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.buildUserDataExport.mockRejectedValue(
      new Error("boom: pg connection reset"),
    );

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("boom");
  });

  it("maps a token that expires mid-request (data-layer JWT error) to 401 with fixed copy (#670)", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.buildUserDataExport.mockRejectedValue(
      new Error("JWT expired (PGRST301)"),
    );

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
      error:
        "Your sign-in is missing or has expired. Sign in again, then retry.",
    });
    expect(JSON.stringify(body)).not.toContain("PGRST301");
  });

  it("classifies the auth rejection by error name, so a second bundled copy of the class still maps to 401 (#670)", async () => {
    const crossBundle = new Error("invalid claim: missing sub claim");
    crossBundle.name = "SupabaseAuthRejectedError";
    mocks.requireSupabaseServerUser.mockRejectedValue(crossBundle);

    const response = await GET(makeRequest({ authorization: "Bearer stale" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe(
      "Your sign-in is missing or has expired. Sign in again, then retry.",
    );
    expect(JSON.stringify(body)).not.toContain("missing sub claim");
    expect(mocks.buildUserDataExport).not.toHaveBeenCalled();
  });

  it("logs an unexpected failure server-side without echoing it (#670)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.buildUserDataExport.mockRejectedValue(
      new Error("permission denied for table tasks"),
    );

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe(
      "Data export failed. Nothing was exported; try again.",
    );
    expect(JSON.stringify(body)).not.toContain("permission denied");
    expect(spy).toHaveBeenCalledWith(
      "export GET failed:",
      expect.objectContaining({ message: "permission denied for table tasks" }),
    );
    spy.mockRestore();
  });
});
