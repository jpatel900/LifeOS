import { beforeEach, describe, expect, it, vi } from "vitest";

const enhanceRollupProse = vi.fn();
const createSupabaseServerClient = vi.fn();
vi.mock("@/lib/ai/rollupProseService", () => ({
  enhanceRollupProse: (...args: unknown[]) => enhanceRollupProse(...args),
}));
vi.mock("@/lib/observability", () => ({
  captureError: vi.fn(async () => {}),
}));
// HIGH-1 (#670): the route now verifies the bearer token via the Supabase
// server client before any provider call, so every test wires this mock.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    createSupabaseServerClient(...args),
}));

import { POST, maxDuration } from "./route";
import {
  AI_ROUTE_RATE_LIMIT,
  resetAiRouteRateLimitsForTests,
} from "@/lib/security/rateLimit";

const draft = {
  highlights: ["Shipped the parser fix"],
  misses: ["Skipped Tuesday review"],
  counts: { wins: 1, completed_sessions: 3, missed_sessions: 1 },
};

function postRequest(body: unknown, token?: string) {
  return new Request("http://localhost/api/rollup-prose", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  areaLabel: "Engineering",
  periodType: "week",
  periodLabel: "2026-06-29 – 2026-07-05",
  draft,
};

describe("POST /api/rollup-prose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAiRouteRateLimitsForTests();
    createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-a" } }, error: null }),
      },
    });
  });

  it("rejects a request with no bearer token before any provider call (denial-of-wallet guard)", async () => {
    const response = await POST(postRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, errorCategory: "auth_rejected" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(enhanceRollupProse).not.toHaveBeenCalled();
  });

  it("rejects a present but invalid bearer token before any provider call", async () => {
    createSupabaseServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("bad jwt"),
        }),
      },
    });

    const response = await POST(postRequest(validBody, "invalid-token"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, errorCategory: "auth_rejected" });
    expect(createSupabaseServerClient).toHaveBeenCalledWith({
      accessToken: "invalid-token",
    });
    expect(enhanceRollupProse).not.toHaveBeenCalled();
  });

  it("returns the enhanced summary and passes the bearer token to the service", async () => {
    const enhanced = { ...draft, highlights: ["Shipped a parser fix 🎉"] };
    enhanceRollupProse.mockResolvedValueOnce({
      source: "ai",
      summary: enhanced,
    });

    const response = await POST(postRequest(validBody, "tok"));
    const json = await response.json();

    expect(json).toMatchObject({ ok: true, source: "ai", summary: enhanced });
    expect(enhanceRollupProse).toHaveBeenCalledWith(
      expect.objectContaining({ areaLabel: "Engineering", periodType: "week" }),
      expect.objectContaining({ traceContext: { accessToken: "tok" } }),
    );
  });

  it("rejects an invalid body with 400 (client keeps its deterministic draft)", async () => {
    const response = await POST(postRequest({ areaLabel: "X" }, "tok"));
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it("rejects a bad periodType with 400", async () => {
    const response = await POST(
      postRequest({ ...validBody, periodType: "year" }, "tok"),
    );
    expect(response.status).toBe(400);
  });

  it("echoes the deterministic draft if the service unexpectedly throws", async () => {
    enhanceRollupProse.mockRejectedValueOnce(new Error("boom"));
    const response = await POST(postRequest(validBody, "tok"));
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      source: "deterministic",
      summary: draft,
      degraded: true,
    });
  });
  it("returns the route's own validation message for a bad body (#670)", async () => {
    const response = await POST(postRequest({ areaLabel: "X" }, "tok"));
    expect(await response.json()).toEqual({
      ok: false,
      error: "periodType must be week or month.",
    });
  });

  it("returns a plain 'Invalid request.' for unparseable JSON instead of the parser error text (#670)", async () => {
    const response = await POST(
      new Request("http://localhost/api/rollup-prose", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer tok",
        },
        body: "{not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Invalid request.",
    });
    expect(enhanceRollupProse).not.toHaveBeenCalled();
  });

  it("returns 429 with plain copy once a user passes the limit, before any provider call (#670)", async () => {
    enhanceRollupProse.mockResolvedValue({ source: "ai", summary: draft });
    for (let i = 0; i < AI_ROUTE_RATE_LIMIT.limit; i += 1) {
      expect((await POST(postRequest(validBody, "tok"))).status).toBe(200);
    }
    enhanceRollupProse.mockClear();

    const response = await POST(postRequest(validBody, "tok"));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Too many requests. Try again in a minute.",
    });
    expect(enhanceRollupProse).not.toHaveBeenCalled();
  });
});

it("allows 60 seconds for the route and its 50-second provider budget", () => {
  expect(maxDuration).toBe(60);
});
