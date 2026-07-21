import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  listExecutionReviewItems: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/data/workflow", () => ({
  listExecutionReviewItems: mocks.listExecutionReviewItems,
}));

import { GET } from "./route";
import { SupabaseAuthRejectedError } from "@/lib/supabase/server";

const WINDOW = "?start=2026-07-17T00:00:00.000Z&end=2026-07-18T00:00:00.000Z";

const makeRequest = (headers: Record<string, string> = {}, query = WINDOW) =>
  new Request(`http://localhost/api/v1/blocks${query}`, { headers });

const block = (
  id: string,
  startAt: string,
  endAt: string,
  taskId: string | null = null,
) => ({
  id,
  task_id: taskId,
  start_at: startAt,
  end_at: endAt,
  status: "scheduled",
});

describe("GET /api/v1/blocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing bearer token with 401 and never touches the data layer", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
    });
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(mocks.listExecutionReviewItems).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed window with 400 before any data work", async () => {
    for (const query of [
      "",
      "?start=2026-07-17T00:00:00.000Z",
      "?start=not-a-date&end=2026-07-18T00:00:00.000Z",
      // start >= end
      "?start=2026-07-18T00:00:00.000Z&end=2026-07-17T00:00:00.000Z",
    ]) {
      const response = await GET(
        makeRequest({ authorization: "Bearer good" }, query),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(mocks.listExecutionReviewItems).not.toHaveBeenCalled();
  });

  it("verifies the token BEFORE any data work and maps auth failure to 401 with a generic body (no raw provider error leaked)", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new SupabaseAuthRejectedError("JWT expired"),
    );

    const response = await GET(
      makeRequest({ authorization: "Bearer invalid" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
    });
    expect(mocks.listExecutionReviewItems).not.toHaveBeenCalled();
  });

  it("returns only blocks overlapping the window plus their linked tasks (RLS seam)", async () => {
    const userClient = { tag: "user-scoped" };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "user-1" },
    });
    mocks.listExecutionReviewItems.mockResolvedValue({
      provider: "supabase",
      blocks: [
        // Fully inside the window.
        block(
          "in-1",
          "2026-07-17T09:00:00.000Z",
          "2026-07-17T10:00:00.000Z",
          "t1",
        ),
        // Straddles the window start boundary — overlaps, included.
        block("in-2", "2026-07-16T23:30:00.000Z", "2026-07-17T00:30:00.000Z"),
        // Ends exactly AT the window start — no overlap, excluded.
        block("out-1", "2026-07-16T23:00:00.000Z", "2026-07-17T00:00:00.000Z"),
        // Starts exactly AT the window end — no overlap, excluded.
        block(
          "out-2",
          "2026-07-18T00:00:00.000Z",
          "2026-07-18T01:00:00.000Z",
          "t2",
        ),
      ],
      tasks: [
        { id: "t1", title: "Linked" },
        { id: "t2", title: "Linked to excluded block" },
        { id: "t3", title: "Unlinked" },
      ],
      sessions: [{ id: "s1" }],
      reviewEntries: [{ id: "r1" }],
    });

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mocks.listExecutionReviewItems).toHaveBeenCalledWith(userClient);

    expect(body.data.blocks.map((entry: { id: string }) => entry.id)).toEqual([
      "in-1",
      "in-2",
    ]);
    // Only tasks linked to in-window blocks; never the whole task list.
    expect(body.data.tasks.map((entry: { id: string }) => entry.id)).toEqual([
      "t1",
    ]);
    // Sessions/review entries from the shared execution read are not leaked
    // into the v1 blocks contract.
    expect(body.data.sessions).toBeUndefined();
    expect(body.data.reviewEntries).toBeUndefined();
    expect(body.data.window).toEqual({
      start: "2026-07-17T00:00:00.000Z",
      end: "2026-07-18T00:00:00.000Z",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps data-layer failures to 500 with a generic body (no exception text leaked)", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: {},
      user: { id: "user-1" },
    });
    mocks.listExecutionReviewItems.mockRejectedValue(
      new Error("boom: pg connection reset"),
    );

    const response = await GET(makeRequest({ authorization: "Bearer good" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("boom");
    expect(body.error).toBe("Something went wrong.");
  });
});
